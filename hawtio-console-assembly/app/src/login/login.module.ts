/// <reference path="./login.globals.ts"/>
/// <reference path="./login.controller.ts"/>
/// <reference path="./keycloak-login/keycloak-login.module.ts"/>

namespace Login {

  export const loginModule = angular
    .module(pluginName, [])
    .component('hawtioLogin', loginComponent)
    .name;

  hawtioPluginLoader.addModule(pluginName);

}
