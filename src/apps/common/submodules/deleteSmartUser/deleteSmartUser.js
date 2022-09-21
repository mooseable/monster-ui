define(function(require) {
	var $ = require('jquery'),
		_ = require('lodash'),
		monster = require('monster');

	var deleteSmartUser = {
		// Defines API requests not included in the SDK
		requests: {},

		// Define the events available for other apps
		subscribe: {
			'common.deleteSmartUser.renderPopup': 'deleteSmartUserRender'
		},

		deleteSmartUserRender: function(args) {
			var self = this,
				user = args.user,
				dataTemplate = {
					user: user
				},
				dialogTemplate = $(self.getTemplate({
					name: 'deleteDialog',
					data: dataTemplate,
					submodule: 'deleteSmartUser'
				}));

			monster.ui.tooltips(dialogTemplate);

			dialogTemplate.find('#confirm_button').on('click', function() {
				var removeDevices = dialogTemplate.find('#delete_devices').is(':checked'),
					removeConferences = dialogTemplate.find('#delete_conferences').is(':checked');

				self.deleteSmartUserDeleteUserData({
					data: {
						accountId: args.accountId,
						userId: user.id
					},
					removeDevices: removeDevices,
					removeConferences: removeConferences,
					success: function(data) {
						popup.dialog('close').remove();

						args.hasOwnProperty('callback') && args.callback(data);
					}
				});
			});

			dialogTemplate.find('#cancel_button').on('click', function() {
				popup.dialog('close').remove();
			});

			var popup = monster.ui.dialog(dialogTemplate, {
				title: '<i class="fa fa-question-circle monster-primary-color"></i>',
				position: ['center', 20],
				dialogClass: 'monster-alert'
			});
		},

		deleteSmartUserDeleteUserData: function(args) {
			var self = this,
				accountId = args.data.accountId,
				userId = args.data.userId,
				removeDevices = args.removeDevices,
				removeConferences = args.removeConferences,
				queryData = {
					accountId: accountId,
					filters: {
						filter_owner_id: userId
					}
				};

			monster.parallel({
				devices: function(callback) {
					if (removeDevices) {
						return callback(null);
					}
					self.deleteSmartUserListDevices({
						data: queryData,
						success: function(data) {
							callback(null, data);
						}
					});
				},
				mobileCallflows: function(callback) {
					self.deleteSmartUserListCallflows({
						data: _.merge({
							filters: {
								filter_type: 'mobile'
							}
						}, queryData),
						success: function(data) {
							callback(null, data);
						}
					});
				},
				conferences: function(callback) {
					if (removeConferences) {
						return callback(null);
					}
					self.deleteSmartUserListConferences({
						data: queryData,
						success: function(data) {
							callback(null, data);
						}
					});
				}
			}, function(error, results) {
				var hasMobileCallflows = !_.isEmpty(results.mobileCallflows),
					listFnDelete = [];

				if (!removeDevices) {
					_.each(results.devices, function(device) {
						listFnDelete.push(function(callback) {
							self.deleteSmartUserUnassignDevice({
								data: {
									accountId: accountId,
									deviceId: device.id
								},
								success: function() {
									callback(null, '');
								}
							});
						});
					});
				}

				if (!removeConferences) {
					_.each(results.conferences, function(conference) {
						listFnDelete.push(function(callback) {
							self.deleteSmartUserUnassignConference({
								data: {
									accountId: accountId,
									conferenceId: conference.id
								},
								success: function(data) {
									callback(null, '');
								}
							});
						});
					});
				}

				if (hasMobileCallflows) {
					_.each(results.mobileCallflows, function(callflow) {
						/*
						Special case for users with mobile devices:
						reassign mobile devices to their respective mobile callflow instead of just deleting the callflow
						*/
						listFnDelete.push(function(callback) {
							self.deleteSmartUserReassignMobileDevice({
								accountId: accountId,
								callflow: callflow,
								success: function(data) {
									callback(null, data);
								}
							});
						});
					});
				}

				monster.parallel(listFnDelete, function(err, resultsDelete) {
					self.deleteSmartUserDeleteUser({
						data: _.merge({
							data: {
								object_types: [
									!hasMobileCallflows && 'callflow',
									removeDevices && 'device',
									removeConferences && 'conference',
									'vmbox'
								]
							}
						}, args.data),
						success: function(data) {
							args.hasOwnProperty('success') && args.success(data);
						}
					});
				});
			});
		},

		deleteSmartUserUnassignDevice: function(args) {
			var self = this;

			monster.waterfall([
				function(callback) {
					self.deleteSmartUserGetDevice({
						data: args.data,
						success: function(deviceGet) {
							callback(null, deviceGet);
						},
						error: function() {
							callback(true);
						}
					});
				},
				function(deviceGet, callback) {
					delete deviceGet.owner_id;

					self.deleteSmartUserUpdateDevice({
						data: _.merge({
							data: deviceGet
						}, args.data),
						success: function(updatedDevice) {
							callback(null, updatedDevice);
						},
						error: function() {
							callback(true);
						}
					});
				}
			], function(err, updatedDevice) {
				if (err) {
					args.hasOwnProperty('error') && args.error(err);
					return;
				}

				args.hasOwnProperty('success') && args.success(updatedDevice);
			});
		},

		deleteSmartUserUnassignConference: function(args) {
			var self = this;

			monster.waterfall([
				function(callback) {
					self.deleteSmartUserGetConference({
						data: args.data,
						success: function(conference) {
							callback(null, conference);
						},
						error: function() {
							callback(true);
						}
					});
				},
				function(conference, callback) {
					conference.name = 'Unassigned ' + conference.name;
					delete conference.owner_id;

					self.deleteSmartUserUpdateConference({
						data: _.merge({
							data: conference
						}, args.data),
						success: function(updatedConference) {
							callback(null, updatedConference);
						},
						error: function() {
							callback(true);
						}
					});
				}
			], function(err, updatedConference) {
				if (err) {
					args.hasOwnProperty('error') && args.error(err);
					return;
				}

				args.hasOwnProperty('success') && args.success(updatedConference);
			});
		},

		deleteSmartUserReassignMobileDevice: function(args) {
			var self = this,
				accountId = args.accountId,
				callflow = args.callflow;

			monster.parallel({
				callflow: function(callback) {
					self.deleteSmartUserGetCallflow({
						data: {
							accountId: accountId,
							callflowId: callflow.id
						},
						success: function(callflow) {
							callback(null, callflow);
						}
					});
				},
				mobileDevice: function(callback) {
					var mdn = callflow.numbers[0].slice(2);

					// List mobile devices
					self.deleteSmartUserListDevices({
						data: {
							accountId: accountId,
							filters: {
								'filter_mobile.mdn': mdn
							}
						},
						success: function(mobileDevices) {
							callback(null, _.head(mobileDevices));
						}
					});
				}
			}, function(err, results) {
				var fullCallflow = results.callflow,
					mobileDevice = results.mobileDevice;

				delete fullCallflow.owner_id;

				if (mobileDevice) {
					_.merge(fullCallflow, {
						flow: {
							module: 'device',
							data: {
								id: mobileDevice.id
							}
						}
					});
				}

				self.deleteSmartUserUpdateCallflow({
					data: {
						accountId: accountId,
						callflowId: fullCallflow.id,
						data: fullCallflow
					},
					success: function(data) {
						args.hasOwnProperty('success') && args.success(data);
					}
				});
			});
		},

		/* API resource calls */

		/* - Devices */

		deleteSmartUserGetDevice: function(args) {
			var self = this;

			self.deleteSmartUserGetResource('device.get', args);
		},

		deleteSmartUserListDevices: function(args) {
			var self = this;

			self.deleteSmartUserListAllResources('device.list', args);
		},

		deleteSmartUserUpdateDevice: function(args) {
			var self = this;

			self.deleteSmartUserModifySingleResource('device.update', args);
		},

		/* - Callflows */

		deleteSmartUserGetCallflow: function(args) {
			var self = this;

			self.deleteSmartUserGetResource('callflow.get', args);
		},

		deleteSmartUserListCallflows: function(args) {
			var self = this;

			self.deleteSmartUserListAllResources('callflow.list', args);
		},

		deleteSmartUserUpdateCallflow: function(args) {
			var self = this;

			self.deleteSmartUserModifySingleResource('callflow.update', args);
		},

		/* - Conferences */

		deleteSmartUserGetConference: function(args) {
			var self = this;

			self.deleteSmartUserGetResource('conference.get', args);
		},

		deleteSmartUserListConferences: function(args) {
			var self = this;

			self.deleteSmartUserListAllResources('conference.list', args);
		},

		deleteSmartUserUpdateConference: function(args) {
			var self = this;

			self.deleteSmartUserModifySingleResource('conference.update', args);
		},

		/* - Users */

		deleteSmartUserDeleteUser: function(args) {
			var self = this;

			self.deleteSmartUserModifySingleResource('user.delete', args);
		},

		/* API utils */

		deleteSmartUserGetResource: function(resource, args) {
			var self = this;

			self.callApi({
				resource: resource,
				data: _.merge({
					accountId: self.accountId
				}, args.data),
				success: function(data) {
					args.hasOwnProperty('success') && args.success(data.data);
				},
				error: function(parsedError) {
					args.hasOwnProperty('error') && args.success(parsedError);
				}
			});
		},

		deleteSmartUserListAllResources: function(resource, args) {
			var self = this;

			self.callApi({
				resource: resource,
				data: _.merge({
					accountId: self.accountId,
					filters: {
						paginate: 'false'
					}
				}, args.data),
				success: function(data) {
					args.hasOwnProperty('success') && args.success(data.data);
				},
				error: function(parsedError) {
					args.hasOwnProperty('error') && args.success(parsedError);
				}
			});
		},

		deleteSmartUserModifySingleResource: function(resource, args) {
			var self = this;

			self.callApi({
				resource: resource,
				data: _.merge({
					accountId: self.accountId,
					data: {}
				}, args.data),
				success: function(data) {
					args.hasOwnProperty('success') && args.success(data.data);
				},
				error: function(parsedError) {
					args.hasOwnProperty('error') && args.success(parsedError);
				}
			});
		}
	};

	return deleteSmartUser;
});
