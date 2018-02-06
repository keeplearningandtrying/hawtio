/// <reference path="./login.globals.ts"/>

namespace Login {

  export class LoginController {

    branding = {};
    entity = {
      username: '',
      password: ''
    };
    wrongPassword: boolean = false;

    constructor(
      private $http: ng.IHttpService,
      private $window: ng.IWindowService) {
      'ngInject';
    }

    $onInit(): void {
      // fetch hawtconfig.json
      this.$http.get('hawtconfig.json')
        .then(function (response: ng.IHttpResponse<Core.Config>) {
          log.debug('hawtconfig.json:', response.data);
          this.branding = response.data.branding;
        },
        function (response) {
          log.warn('Failed to fetch hawtconfig.json', response);
        });
    }

    doLogin(): void {
      let url = 'auth/login';
      if (this.entity.username.trim() == '') {
        return;
      }
      this.$http.post(url, this.entity).then(
        function (response) {
          log.debug("login success:", response.data);
          this.$window.location.href = '/hawtio/';
        },
        function (response) {
          log.error('Failed to log in', response);
          this.ctrl.wrongPassword = true;
        });
    }
  }

  export const loginComponent: angular.IComponentOptions = {
    controller: LoginController,
    templateUrl: 'src/login/login-template.html'
  };
}
