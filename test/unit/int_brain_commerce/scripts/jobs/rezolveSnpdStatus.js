'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

function createModule(overrides) {
    var defaults = {
        activeTasks: null,
        serviceResponse: null,
        transactionCalls: [],
        taskUpdates: []
    };
    var opts = {};
    Object.keys(defaults).forEach(function (k) { opts[k] = overrides && overrides[k] !== undefined ? overrides[k] : defaults[k]; });

    return proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/jobs/rezolveSnpdStatus', {
        'dw/system/Logger': {
            info: function () {},
            error: function () {},
            warn: function () {}
        },
        'dw/system/Status': function (status, code) {
            this.status = status;
            this.code = code;
        },
        'dw/object/CustomObjectMgr': {
            queryCustomObjects: function () {
                return opts.activeTasks;
            }
        },
        'dw/system/Transaction': {
            wrap: function (cb) {
                opts.transactionCalls.push(true);
                return cb();
            }
        },
        '*/cartridge/scripts/services/rezolveSnpdService': {
            getTaskDetail: function () {
                return opts.serviceResponse;
            }
        }
    });
}

function makeTaskIterator(tasks) {
    var index = 0;
    return {
        hasNext: function () { return index < tasks.length; },
        next: function () { return tasks[index++]; }
    };
}

function makeTask(overrides) {
    var now = new Date();
    return {
        custom: {
            taskID: (overrides && overrides.taskID) || 'task-001',
            status: (overrides && overrides.status) || 'PENDING',
            currentStage: '',
            lastCheckedAt: null,
            completedAt: null,
            ingestionProcessingTimeSec: 0,
            numProcessedRecords: 0,
            numIndexedDocuments: 0,
            numFailedRecords: 0
        },
        lastModified: (overrides && overrides.lastModified) || now.toISOString()
    };
}

describe('rezolveSnpdStatus', function () {
    describe('pollAndUpdate', function () {
        it('should return OK with NO_TASKS when no active tasks found', function () {
            var mod = createModule({ activeTasks: null });
            var result = mod.pollAndUpdate();
            assert.equal(result.code, 'NO_TASKS');
        });

        it('should return OK with COMPLETED when tasks iterator is empty', function () {
            var mod = createModule({ activeTasks: makeTaskIterator([]) });
            var result = mod.pollAndUpdate();
            assert.equal(result.code, 'COMPLETED');
        });

        it('should mark task as SUCCESS when API returns COMPLETE', function () {
            var task = makeTask();
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: {
                    success: true,
                    data: {
                        currentStage: 'COMPLETE',
                        processing: {
                            indexingDuration: '00:05:30',
                            numProcessedRecords: 100,
                            numIndexedDocuments: 95,
                            numFailedRecords: 5
                        }
                    }
                }
            });
            var result = mod.pollAndUpdate();
            assert.equal(result.code, 'COMPLETED');
            assert.equal(task.custom.status, 'SUCCESS');
            assert.isNotNull(task.custom.completedAt);
            assert.equal(task.custom.currentStage, 'COMPLETE');
        });

        it('should populate metrics on COMPLETE status', function () {
            var task = makeTask();
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: {
                    success: true,
                    data: {
                        currentStage: 'COMPLETE',
                        processing: {
                            indexingDuration: '01:00:00',
                            numProcessedRecords: 500,
                            numIndexedDocuments: 490,
                            numFailedRecords: 10
                        }
                    }
                }
            });
            mod.pollAndUpdate();
            assert.equal(task.custom.ingestionProcessingTimeSec, 3600);
            assert.equal(task.custom.numProcessedRecords, 500);
            assert.equal(task.custom.numIndexedDocuments, 490);
            assert.equal(task.custom.numFailedRecords, 10);
        });

        it('should mark task as FAILED when API returns FAILED', function () {
            var task = makeTask();
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: {
                    success: true,
                    data: {
                        currentStage: 'FAILED',
                        processing: {
                            numProcessedRecords: 50,
                            numIndexedDocuments: 0,
                            numFailedRecords: 50
                        }
                    }
                }
            });
            mod.pollAndUpdate();
            assert.equal(task.custom.status, 'FAILED');
            assert.isNotNull(task.custom.completedAt);
        });

        it('should mark task as IN_PROGRESS for QUEUED stage', function () {
            var task = makeTask();
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: {
                    success: true,
                    data: { currentStage: 'QUEUED' }
                }
            });
            mod.pollAndUpdate();
            assert.equal(task.custom.status, 'IN_PROGRESS');
            assert.isNull(task.custom.completedAt);
        });

        it('should mark task as IN_PROGRESS for IN_PROGRESS stage', function () {
            var task = makeTask();
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: {
                    success: true,
                    data: { currentStage: 'IN_PROGRESS' }
                }
            });
            mod.pollAndUpdate();
            assert.equal(task.custom.status, 'IN_PROGRESS');
        });

        it('should mark task as TIMED_OUT when lastModified is older than 24 hours', function () {
            var oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
            var task = makeTask({ lastModified: oldDate.toISOString() });
            var mod = createModule({
                activeTasks: makeTaskIterator([task])
            });
            mod.pollAndUpdate();
            assert.equal(task.custom.status, 'TIMED_OUT');
            assert.isNotNull(task.custom.completedAt);
        });

        it('should not time out task when lastModified is within 24 hours', function () {
            var recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
            var task = makeTask({ lastModified: recentDate.toISOString() });
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: {
                    success: true,
                    data: { currentStage: 'IN_PROGRESS' }
                }
            });
            mod.pollAndUpdate();
            assert.equal(task.custom.status, 'IN_PROGRESS');
        });

        it('should handle service error gracefully', function () {
            var task = makeTask();
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: {
                    success: false,
                    message: 'Service unavailable'
                }
            });
            var result = mod.pollAndUpdate();
            assert.equal(result.code, 'COMPLETED');
            // Task status should not change to SUCCESS or FAILED
            assert.equal(task.custom.status, 'PENDING');
        });

        it('should handle null service response data', function () {
            var task = makeTask();
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: null
            });
            var result = mod.pollAndUpdate();
            assert.equal(result.code, 'COMPLETED');
        });

        it('should handle metrics with no processing data on COMPLETE', function () {
            var task = makeTask();
            var mod = createModule({
                activeTasks: makeTaskIterator([task]),
                serviceResponse: {
                    success: true,
                    data: {
                        currentStage: 'COMPLETE'
                    }
                }
            });
            mod.pollAndUpdate();
            assert.equal(task.custom.status, 'SUCCESS');
            assert.equal(task.custom.ingestionProcessingTimeSec, 0);
            assert.equal(task.custom.numProcessedRecords, 0);
        });

        it('should process multiple tasks', function () {
            var task1 = makeTask({ taskID: 'task-001' });
            var task2 = makeTask({ taskID: 'task-002' });
            var callCount = 0;
            var mod = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/jobs/rezolveSnpdStatus', {
                'dw/system/Logger': { info: function () {}, error: function () {}, warn: function () {} },
                'dw/system/Status': function (status, code) { this.status = status; this.code = code; },
                'dw/object/CustomObjectMgr': {
                    queryCustomObjects: function () {
                        return makeTaskIterator([task1, task2]);
                    }
                },
                'dw/system/Transaction': { wrap: function (cb) { return cb(); } },
                '*/cartridge/scripts/services/rezolveSnpdService': {
                    getTaskDetail: function () {
                        callCount++;
                        return {
                            success: true,
                            data: { currentStage: 'COMPLETE', processing: { numProcessedRecords: 10 } }
                        };
                    }
                }
            });
            mod.pollAndUpdate();
            assert.equal(callCount, 2);
            assert.equal(task1.custom.status, 'SUCCESS');
            assert.equal(task2.custom.status, 'SUCCESS');
        });
    });
});
