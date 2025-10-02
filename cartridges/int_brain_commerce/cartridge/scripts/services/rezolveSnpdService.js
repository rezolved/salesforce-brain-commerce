'use strict';

const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');
// const Status = require('dw/svc/Status');

/**
 * Builds a full URL by concatenating the base URL with the provided path.
 * @param {string} base - Base URL
 * @param {string} path - URL path to append
 * @returns {string} Full URL
 */
function buildUrl(base, path) {
    return base + (path || '');
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
 * Builds a multipart/form-data body from the given fields.
 * @param {Object} fields - Key-value pairs to include in the form data
 * @returns {{body: string, boundary: string}} Multipart body and boundary string
 */
function buildMultipart(fields) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2, 9);
    let body = '';
    const keys = Object.keys(fields);

    keys.forEach(function (key) {
        body += '--' + boundary + '\r\n';
        body += 'Content-Disposition: form-data; name="' + key + '"\r\n';
        body += 'Content-Type: text/plain\r\n\r\n';
        body += String(fields[key]) + '\r\n';
    });

    body += '--' + boundary + '--\r\n';

    return { body, boundary };
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

                // For GET requests, don't send multipart body; set Accept header
                if (method === 'GET') {
                    svc.addHeader('Accept', 'application/json');
                    return null;
                }

                // For non-GET, send multipart/form-data body
                const fields = params && params.requestBody ? params.requestBody : {};
                const { body, boundary } = buildMultipart(fields);
                svc.addHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
                Logger.info('Rezolve SNPD API Request: {0} {1}', method, fullUrl);
                return body;
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

            const requestBody = params.requestBody || {
                taskType: params.taskType,
                data: params.data || {},
                options: params.options || {},
                timestamp: new Date().toISOString()
            };
            Logger.info('Authentication Type2 : {0}', service.getAuthentication());
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

