'use strict';

const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');
const File = require('dw/io/File');
const HTTPRequestPart = require('dw/net/HTTPRequestPart');
// const Status = require('dw/svc/Status');

/**
 * Service wrapper for Rezolve SNPD API operations
 * Provides functions to initiate tasks and get task status
 */
const RezolveSnpdService = {

    /**
   * Get service instance with dynamic configuration
   * @returns {dw.svc.Service} Configured service instance
   */
    getService: function () {
        Logger.info('Getting Rezolve SNPD service instance');
        return LocalServiceRegistry.createService('rezolvesnpd.http.ingest', {
            createRequest: function (svc, params) {
                const baseUrl = Site.current.getCustomPreferenceValue('rezolveIngestionApiUrl');
                const endPointPath = params && params.endPointConfigs && params.endPointConfigs.endPoint ? params.endPointConfigs.endPoint : '';
                const fullUrl = baseUrl + (endPointPath || '');
                svc.setURL(fullUrl);
                const method = params && params.endPointConfigs && params.endPointConfigs.method ? params.endPointConfigs.method : 'POST';
                svc.setRequestMethod(method);

                // Set headers according to expected API contract
                if (Site.current.getCustomPreferenceValue('rezolveClientKey')) {
                    svc.addHeader('Authorization', 'client-key ' + Site.current.getCustomPreferenceValue('rezolveClientKey'));
                }
                if (Site.current.getCustomPreferenceValue('rezolveCustomerId')) {
                    svc.addHeader('X-Groupby-Customer-Id', Site.current.getCustomPreferenceValue('rezolveCustomerId'));
                }

                if (method === 'GET') {
                    svc.addHeader('Accept', 'application/json');
                    return null;
                }

                const fields = params && params.requestBody ? params.requestBody : {};
                const requestParts = [];

                Object.keys(fields).forEach(function (key) {
                    if (key === 'catalog') {
                        if (typeof fields[key] === 'string') {
                            const file = new File(fields[key]);
                            if (file.exists()) {
                                requestParts.push(new HTTPRequestPart(key, file));
                                Logger.info('Added file part for catalog: {0}', file.getFullPath());
                            } else {
                                Logger.error('Catalog file does not exist: {0}', fields[key]);
                                requestParts.push(new HTTPRequestPart(key, String(fields[key])));
                            }
                        } else if (fields[key] instanceof File) {
                            requestParts.push(new HTTPRequestPart(key, fields[key]));
                            Logger.info('Added file object part for catalog: {0}', fields[key].getFullPath());
                        } else {
                            requestParts.push(new HTTPRequestPart(key, String(fields[key])));
                        }
                    } else {
                        requestParts.push(new HTTPRequestPart(key, String(fields[key]), 'UTF-8'));
                    }
                });
                return requestParts;
            },

            parseResponse: function (svc, response) {
                Logger.info('Parsing response from Rezolve SNPD service');
                const statusCode = response.getStatusCode();
                const responseText = response.getText();
                let errorData = null;

                if (statusCode >= 200 && statusCode < 300) {
                    return {
                        success: true,
                        statusCode: statusCode,
                        data: responseText ? JSON.parse(responseText) : null,
                        message: 'Request completed successfully'
                    };
                }
                if (statusCode >= 400 && statusCode < 500) {
                    try {
                        errorData = responseText ? JSON.parse(responseText) : null;
                    } catch (e) {
                        Logger.error('Failed to parse error response: {0}', e.message);
                    }

                    return {
                        success: false,
                        statusCode: statusCode,
                        error: errorData || { message: 'Client error occurred' },
                        message: 'Client error: ' + statusCode
                    };
                }
                if (statusCode >= 500) {
                    try {
                        errorData = responseText ? JSON.parse(responseText) : null;
                    } catch (e) {
                        Logger.error('Failed to parse error response: {0}', e.message);
                    }

                    return {
                        success: false,
                        statusCode: statusCode,
                        error: errorData || { message: 'Server error occurred' },
                        message: 'Server error: ' + statusCode
                    };
                }
                return {
                    success: false,
                    statusCode: statusCode,
                    error: { message: 'Unexpected response status' },
                    message: 'Unexpected response: ' + statusCode
                };
            },

            getRequestLogMessage: function (request) {
                return 'Rezolve SNPD API Request: ' + request.getMethod() + ' ' + request.getURL();
            },

            getResponseLogMessage: function (response) {
                return 'Rezolve SNPD API Response: ' + response.getStatusCode() + ' - ' + response.getText();
            }
        });
    },

    /**
   * Initiate a task with the Rezolve SNPD API
   * @param {Object} params - Task parameters
   * @param {string} params.taskType - Type of task to initiate
   * @param {Object} params.data - Task data payload
   * @param {Object} params.options - Additional options
   * @returns {Object} Response object with success status and data
   */
    initiateTask: function (params) {
        Logger.info('Initiating task of type: {0}', params.taskType);
        try {
            if (!params) {
                return {
                    success: false,
                    error: { message: 'Parameters are required' },
                    message: 'Invalid parameters: parameters are required'
                };
            }

            const service = this.getService();

            let requestBody;
            if (params.requestBody) {
                requestBody = params.requestBody;
            } else {
                requestBody = {};
                if (params.data) {
                    Object.keys(params.data).forEach(function (key) {
                        requestBody[key] = params.data[key];
                    });
                }
                requestBody.taskType = params.taskType;
                requestBody.options = params.options || {};
                requestBody.timestamp = new Date().toISOString();
            }
            Logger.info('Authentication Type : {0}', service.getAuthentication());
            const result = service.call({
                requestBody: requestBody,
                endPointConfigs: { method: 'POST', endPoint: '/api/tasks' }
            });

            if (result.isOk()) {
                Logger.info('Task initiated successfully: {0}', params.taskType);
                return result.getObject();
            }
            Logger.error('Failed to initiate task: {0}{1}', result.error, result.getErrorMessage());
            return {
                success: false,
                error: { message: result.getErrorMessage() },
                message: 'Service call failed'
            };
        } catch (error) {
            Logger.error('Error initiating task: {0}', error.message);
            return {
                success: false,
                error: { message: error.message },
                message: 'Exception occurred while initiating task'
            };
        }
    },

    /**
   * Get the status of a specific task from the Rezolve SNPD API
   * @param {Object} params - Task status parameters
   * @param {string} params.taskId - ID of the task to check
   * @param {boolean} [params.waitForCompletion=false] - Whether to wait for completion
   * @returns {Object} Response object with task status and data
   */
    getTaskStatus: function (params) {
        Logger.info('Getting task status for taskId: {0}', params && params.taskId);
        try {
            if (!params || !params.taskId) {
                return {
                    success: false,
                    error: { message: 'Task ID is required' },
                    message: 'Invalid parameters: task ID is required'
                };
            }

            const waitForCompletion = (typeof params.waitForCompletion === 'boolean') ? params.waitForCompletion : false;
            const endPoint = '/api/tasks/' + params.taskId + '?waitForCompletion=' + (waitForCompletion ? 'true' : 'false');

            const service = this.getService();
            const result = service.call({
                endPointConfigs: { method: 'GET', endPoint: endPoint }
            });

            const obj = result.getObject();

            if (result.isOk()) {
                Logger.info('Task status retrieved successfully: {0}', params.taskId);
                return obj && obj.data && obj.data.currentStage ? obj.data.currentStage : null;
            }
            Logger.error('Failed to get task status: {0}', result.getErrorMessage());
            return {
                success: false,
                error: { message: result.getErrorMessage() },
                message: 'Service call failed'
            };
        } catch (error) {
            Logger.error('Error getting task status: {0}', error.message);
            return {
                success: false,
                error: { message: error.message },
                message: 'Exception occurred while getting task status'
            };
        }
    }
};

module.exports = RezolveSnpdService;

