'use strict';

const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');
const File = require('dw/io/File');
const HTTPRequestPart = require('dw/net/HTTPRequestPart');
// const Status = require('dw/svc/Status');

/**
 * Builds a full URL by concatenating the base URL with the provided path.
 * @param {string} base - Base URL
 * @param {string} path - URL path to append
 * @returns {string} Full URL
 */
function buildUrl(base, path) {
    if (!base) return String(path || '');
    if (!path) return String(base);
    return String(base).replace(/\/+$/, '') + '/' + String(path || '').replace(/^\/+/, '');
}

/**
 * Safely parses a JSON string, returning an object with success status and parsed value or error message.
 * @param {string} text - JSON string to parse
 * @returns {{ok: boolean, value: any}|{ok: boolean, value: null}|{ok: boolean, error}} Parse result
 */
function safeJsonParse(text) {
    if (!text) return { ok: true, value: null };
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

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
                const fullUrl = buildUrl(
                    Site.current.getCustomPreferenceValue('rezolveIngestionApiUrl'),
                    params && params.endPointConfigs && params.endPointConfigs.endPoint ? params.endPointConfigs.endPoint : ''
                );
                svc.setURL(fullUrl);
                const method = (params && params.endPointConfigs && params.endPointConfigs.method) || 'POST';
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

                const parseResult = safeJsonParse(responseText);
                if (!parseResult.ok) {
                    return {
                        success: false,
                        statusCode,
                        data: null,
                        message: `Failed to parse JSON response: ${parseResult.error}`
                    };
                }
                const parsedData = parseResult.value;

                if (statusCode >= 200 && statusCode < 300) {
                    return {
                        success: true,
                        statusCode: statusCode,
                        data: parsedData,
                        message: 'Request completed successfully'
                    };
                }
                if (statusCode >= 400 && statusCode < 500) {
                    errorData = parsedData || null;

                    return {
                        success: false,
                        statusCode: statusCode,
                        error: errorData || { message: 'Client error occurred' },
                        message: 'Client error: ' + statusCode
                    };
                }
                if (statusCode >= 500) {
                    errorData = parsedData || null;

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
            Logger.error(
                'Failed to initiate task: {0} - {1}',
                JSON.stringify(result.error || {}),
                result.getErrorMessage()
            );
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
     * Get the detail of a specific task from the Rezolve SNPD API
     * @param {string} taskId - ID of the task to get details for
     * @param {boolean} [waitForCompletion=false] - Whether to wait for completion
     * @returns {Object} Response object with task status and data
     */
    getTaskDetail: function (taskId, waitForCompletion) {
        Logger.info('Getting task details for taskId: {0}', taskId);
        try {
            if (!taskId) {
                return {
                    success: false,
                    statusCode: 400,
                    data: null,
                    error: { message: 'Task ID is required' },
                    message: 'Invalid parameters: task ID is required'
                };
            }

            const wait = (typeof waitForCompletion === 'undefined') ? false : waitForCompletion;
            const endPoint = '/api/tasks/' + encodeURIComponent(taskId) + '?waitForCompletion=' + (wait ? 'true' : 'false');

            const service = this.getService();
            const result = service.call({
                endPointConfigs: { method: 'GET', endPoint: endPoint }
            });

            if (result.isOk()) {
                const obj = result.getObject();
                Logger.info('Task details retrieved successfully: {0}', taskId);
                return {
                    success: true,
                    statusCode: result.getStatus(),
                    data: obj && obj.data ? obj.data : obj,
                    message: 'Task status retrieved'
                };
            }

            Logger.error('Failed to get task details: {0}', result.getErrorMessage());
            return {
                success: false,
                statusCode: result.getStatusCode ? result.getStatusCode() : 500,
                data: null,
                error: { message: result.getErrorMessage() },
                message: 'Service call failed'
            };
        } catch (error) {
            Logger.error('Error getting task details: {0}', error.message);
            return {
                success: false,
                statusCode: 500,
                data: null,
                error: { message: error.message },
                message: 'Exception occurred while getting task details'
            };
        }
    }
};

module.exports = RezolveSnpdService;

