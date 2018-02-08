/// <reference path="./login.globals.ts"/>
/// <reference path="../../node_modules/keycloak-js/dist/keycloak.d.ts"/>

namespace Login {

  /**
   * Info related to keycloak integration
   */
  export interface KeycloakContext {
    enabled: boolean;
    keycloak: Keycloak.KeycloakInstance;
  }

  export interface KeycloakPostLoginTasks {
    bootstrapIfNeeded: Function;
  }

  const log: Logging.Logger = Logger.get('hawtio-login-keycloak');

  const KEYCLOAK_ENABLED_URL: string = "keycloak/enabled";
  const KEYCLOAK_JSON_URL: string = "keycloak/client-config";
  const KEYCLOAK_VALIDATE_URL: string = "keycloak/validate-subject-matches";

  /**
   * Send ajax request to KeycloakServlet to figure out if keycloak integration is enabled
   */
  function checkKeycloakEnabled(callback: (context: KeycloakContext) => void) {
    $.ajax(KEYCLOAK_ENABLED_URL, <JQueryAjaxSettings>{
      type: "GET",
      success: (response) => {
        log.debug("Got response for check if keycloak is enabled:", response);
        let keycloakEnabled = (response === true || response === "true");

        if (!keycloakEnabled) {
          let keycloakContext = createKeycloakContext(false);
          callback(keycloakContext);
        } else {
          loadKeycloakAdapter(callback);
        }
      },
      error: (xhr, textStatus, error) => {
        // Just fallback to false if we couldn't figure userDetails
        log.debug("Failed to retrieve if keycloak is enabled.:", error);
        let keycloakContext = createKeycloakContext(false);
        callback(keycloakContext);
      }
    });
  }

  /**
   * Send ajax request to KeycloakServlet to figure out auth-server-url
   */
  function loadKeycloakAdapter(callback: (context: KeycloakContext) => void) {
    $.ajax(KEYCLOAK_JSON_URL, <JQueryAjaxSettings>{
      type: "GET",
      success: (response) => {
        log.debug("Got response for check auth-server-url:", response);

        let authServerUrl = response['auth-server-url'];
        let keycloakJsUrl = authServerUrl + '/js/keycloak.js';

        log.debug("Will download keycloak.js from URL:", keycloakJsUrl);
        loadScriptTag(keycloakJsUrl, callback);
      },
      error: (xhr, textStatus, error) => {
        // Just fallback to false if we couldn't figure userDetails
        log.debug("Failed to retrieve keycloak.js:", error);
        let keycloakContext: KeycloakContext = createKeycloakContext(false);
        callback(keycloakContext);
      }
    });
  }

  function loadScriptTag(scriptUrl: string, callback: (context: KeycloakContext) => void): void {
    let scriptEl = document.createElement('script');
    scriptEl.type = "text/javascript";
    scriptEl.src = scriptUrl;
    scriptEl.onload = () => {
      let keycloakContext: KeycloakContext = createKeycloakContext(true);
      callback(keycloakContext);
    }
    scriptEl.onerror = () => {
      log.error("Not able to load keycloak.js from:", scriptUrl);
    }

    document.getElementsByTagName("body")[0].appendChild(scriptEl);
  }

  /**
   * Create keycloak context instance and push it to angular
   */
  function createKeycloakContext(keycloakEnabled: boolean): KeycloakContext {
    // It's KeycloakServlet, which handles to resolve keycloak.json on provided path
    let keycloakAuth: Keycloak.KeycloakInstance = keycloakEnabled ? new Keycloak(KEYCLOAK_JSON_URL) : null;
    let keycloakContext: KeycloakContext = {
      enabled: keycloakEnabled,
      keycloak: keycloakAuth
    }

    // Push it to angular
    angular.module(loginModule).factory('keycloakContext', () => keycloakContext);

    return keycloakContext;
  }


  function initKeycloakIfNeeded(keycloakContext: KeycloakContext, nextTask: () => void): void {
    if (!keycloakContext.enabled) {
      // Just continue
      log.debug('Keycloak authentication not required. Skip Keycloak bootstrap');
      nextTask();
    }

    log.debug('Keycloak authentication required. Initializing Keycloak');
    let keycloak: Keycloak.KeycloakInstance = keycloakContext.keycloak;

    let kcInitOptions;
    if ('keycloakToken' in window) {
      kcInitOptions = window['keycloakToken'];
      log.debug('Initialize keycloak with token passed from different window');
    } else {
      kcInitOptions = { onLoad: 'login-required' };
    }

    keycloak.init(kcInitOptions)
      .success(() => {
        let keycloakUsername: string = keycloak.subject;
        log.debug(`Keycloak authenticated with Subject ${keycloakUsername}. Validating subject matches`);

        validateSubjectMatches(keycloakUsername, () => {
          log.debug("validateSubjectMatches finished! Continue next task");
          // Continue next registered task and bootstrap Angular
          keycloakJaasSetup(keycloak, nextTask);
        });
      })
      .error(() => {
        log.warn("Keycloak authentication failed!");
        Core.notification('danger', 'Failed to log in to Keycloak');
      });
  }


  /**
   * Validate if subject authenticated through Keycloak matches with SSO
   */
  function validateSubjectMatches(keycloakUser: string, callback: () => void) {
    let keycloakValidateUrl: string = `${KEYCLOAK_VALIDATE_URL}?keycloakUser=${encodeURIComponent(keycloakUser)}`;

    $.ajax(keycloakValidateUrl, <JQueryAjaxSettings>{
      type: "GET",
      success: (response) => {
        log.debug("Got response for validate subject matches:", response);
        callback();
      },
      error: (xhr, textStatus, error) => {
        // Just fallback to false if we couldn't figure userDetails
        log.debug("Failed to validate subject matches:", error);
        callback();
      }
    });
  }

  /**
   * Attach token to each HTTP request to jolokia and other secured services
   */
  function keycloakJaasSetup(keycloak: Keycloak.KeycloakInstance, callback: () => void) {
    let url = "auth/login/";

    if (keycloak.token && keycloak.token != '') {
      log.debug('Keycloak authentication token found! Attach it to JQuery requests');

      $.ajaxSetup(<JQueryAjaxSettings>{

        beforeSend: (xhr, settings) => {
          if (keycloak.authenticated && !keycloak.isTokenExpired(10)) {
            xhr.setRequestHeader('Authorization', Core.getBasicAuthHeader(keycloak.subject, keycloak.token));
          } else {
            log.debug("Skipped request " + settings.url + " for now.");
            keycloak.updateToken(10).success(function (refreshed) {
              if (refreshed) {
                log.debug('Keycloak token refreshed. Set new value to userDetails');
              }

              log.debug("Re-sending request after successfully update keycloak token: " + settings.url);
              $.ajax(settings);
            }).error(function () {
              log.warn('Failed to refresh keycloak token!');
              keycloak.logout();
            });

            return false;
          }
        }
      });

      // Check if able to retrieve user's details
      $.ajax("user", <JQueryAjaxSettings>{
        type: "GET",
        success: function (response) {
          log.debug("Got response from user's details: ", response);
          if (response && response != null) {
            callback();
          } else {
            let notificationOptions = {
              timeOut: "60000",
              onclick: function () {
                keycloak.logout();
              }
            };
            Core.notification('danger', 'Unauthorized User<br />Click here to Logout', notificationOptions);
          }
        },
        error: function (xhr, textStatus, error) {
          Core.notification('danger', 'Failed to log in, ' + error);
        }
      });

    } else {
      Core.notification('danger', 'Keycloak auth token not found.');
    }

  };

  /**
   * Prebootstrap task, which handles Keycloak OAuth flow. It will first check if keycloak is enabled and then possibly init keycloak.
   * It will continue with Angular bootstrap just when Keycloak authentication is successfully finished
   */
  hawtioPluginLoader.registerPreBootstrapTask(function (nextTask) {
    log.debug('Prebootstrap task executed');

    checkKeycloakEnabled(function (keycloakContext) {
      initKeycloakIfNeeded(keycloakContext, nextTask);
    });
  });

  /**
   * Method is called from corePlugins. This is at the stage where Keycloak authentication is always finished.
   */
  angular.module(pluginName)
    .factory('keycloakPostLoginTasks', keycloakPostLoginTasks);

  function keycloakPostLoginTasks(
    $rootScope,
    userDetails: Core.UserDetails,
    jolokiaUrl,
    localStorage,
    keycloakContext: KeycloakContext,
    postLogoutTasks): KeycloakPostLoginTasks {
    'ngInject';

    let bootstrapIfNeededFunc = () => {
      if (!keycloakContext.enabled) {
        return;
      }

      log.debug("keycloakPostLoginTasks triggered");
      let keycloakAuth: Keycloak.KeycloakInstance = keycloakContext.keycloak;

      // Handle logout triggered from hawtio.
      postLogoutTasks.addTask('KeycloakLogout', () => {
        if (keycloakAuth.authenticated) {
          log.debug("postLogoutTask: Going to trigger keycloak logout");
          keycloakAuth.logout();

          // We redirected to keycloak logout. Skip execution of onComplete callback
          return false;
        } else {
          log.debug("postLogoutTask: Keycloak not authenticated. Skip calling keycloak logout");
          return true;
        }
      });

      // Detect keycloak logout based on iframe. We need to trigger hawtio logout too to ensure single-sign-out
      keycloakAuth.onAuthLogout = () => {
        log.debug('keycloakAuth.onAuthLogout triggered!');
        Core.logout(jolokiaUrl, userDetails, localStorage, $rootScope);
      };
    };

    return { bootstrapIfNeeded: bootstrapIfNeededFunc };
  }

}
