module Fabric {
  
  export function ProfilesController($scope, $location:ng.ILocationService, workspace:Workspace, jolokia) {

    $scope.defaultVersion = jolokia.execute(managerMBean, "defaultVersion()");
    $scope.version = { id: $scope.defaultVersion.id };

    $scope.selected = [];
    $scope.selectedParents = [];

    $scope.deleteVersionDialog = false;
    $scope.deleteProfileDialog = false;

    $scope.createProfileDialog = false;

    $scope.$watch('createProfileDialog', function() {
      if ($scope.createProfileDialog) {
        setTimeout(function() {
          $('.dialogGrid').trigger('resize');
        }, 10);
      }
    });

    $scope.newProfileName = '';

    var key = $location.search()['pv'];
    if (key) {
      $scope.version = { id: key };
    }
    
    key = $location.search()['ao'];
    if (angular.isDefined(key) && key === 'true') {
      $scope.activeOnly = true;
    } else {
      $scope.activeOnly = false;
    }
    
    $scope.versions = [];
    $scope.profiles = [];
    
    $scope.versionResponse = [];
    $scope.profilesResponse = [];
    
    $scope.$watch('activeOnly', function(oldValue, newValue) {
      if (oldValue === newValue) {
        return;
      }
      var q = $location.search();
      q['ao'] = "" + $scope.activeOnly;
      $location.search(q);
    });
    
    $scope.$watch('version', function(oldValue, newValue) {
      var q = $location.search();
      q['pv'] = $scope.version.id;
      $location.search(q);

      if (oldValue === newValue) {
        notification('info', "Please wait, fetching profile data for version" + $scope.version.id);
      }
      
      Core.unregister(jolokia, $scope);
      Core.register(jolokia, $scope,[
        {type: 'exec', mbean: managerMBean, operation: 'versions'},
        {type: 'exec', mbean: managerMBean, operation: 'getProfiles(java.lang.String)', arguments: [$scope.version.id]}],
        onSuccess(render));
    });

    $scope.selectedHasContainers = () => {
      return $scope.selected.findAll(function(item) { return item.containerCount > 0 }).length > 0;
    }

    $scope.versionCanBeDeleted = () => {
      if ($scope.version.id === $scope.defaultVersion.id) {
        return true;
      }
      if ($scope.versions.length === 0) {
        return true;
      }
      return $scope.profiles.findAll(function(item) {return item.containerCount > 0 }).length > 0;
    }

    $scope.createProfileGridOptions = {
      data: 'profiles',
      selectedItems: $scope.selectedParents,
      showSelectionCheckbox: true,
      multiSelect: true,
      selectWithCheckboxOnly: false,
      keepLastSelected: false,
      columnDefs: [
        {
          field: 'id',
          displayName: 'Name'
        }]
    }


    $scope.gridOptions = {
      data: 'profiles',
      showFilter: false,
      showColumnMenu: false,
      filterOptions: {
        filterText: ''
      },
      selectedItems: $scope.selected,
      showSelectionCheckbox: true,
      multiSelect: true,
      selectWithCheckboxOnly: true,
      keepLastSelected: false,
      checkboxCellTemplate: '<div class="ngSelectionCell"><input tabindex="-1" class="ngSelectionCheckbox" type="checkbox" ng-checked="row.selected" ng-disabled="row.entity.containerCount > 0 || row.entity.childIds.length > 0"/></div>',
      columnDefs: [
        { 
          field: 'id',
          displayName: 'Name',
          cellTemplate: '<div class="ngCellText"><a ng-href="#/fabric/profile/{{$parent.version.id}}/{{row.getProperty(col.field)}}{{hash}}">{{row.getProperty(col.field)}}</a></div>',
          width: 300
        },
        {
          field: 'attributes',
          displayName: 'A',
          headerCellTemplate: '<div ng-click="col.sort()" class="ngHeaderSortColumn {{col.headerClass}}" ng-style="{\'cursor\': col.cursor}" ng-class="{ \'ngSorted\': !noSortVisible }"><div class="ngHeaderText colt{{$index}} pagination-centered" title="Attributes"><i class="icon-cogs"></i></div><div class="ngSortButtonDown" ng-show="col.showSortButtonDown()"></div><div class="ngSortButtonUp" ng-show="col.showSortButtonUp()"></div></div>',
          cellTemplate: '<div class="ngCellText"><ul class="unstyled inline"><li class="attr-column"><i ng-show="row.entity.locked" title="Locked" class="icon-lock"></i></li><li class="attr-column"><i ng-show="row.entity.abstract" title="Abstract" class="icon-font"></i></li></ul></div>',
          width: 52
        },
        {
          field: 'containerCount',
          displayName: 'C',
          headerCellTemplate: '<div ng-click="col.sort()" class="ngHeaderSortColumn {{col.headerClass}}" ng-style="{\'cursor\': col.cursor}" ng-class="{ \'ngSorted\': !noSortVisible }"><div class="ngHeaderText colt{{$index}} pagination-centered" title="Containers"><i class="icon-truck"></i></div><div class="ngSortButtonDown" ng-show="col.showSortButtonDown()"></div><div class="ngSortButtonUp" ng-show="col.showSortButtonUp()"></div></div>',
          cellTemplate: '<div class="ngCellText pagination-centered"><a ng-show="row.getProperty(col.field) > 0" title="{{row.entity.containers.sortBy().join(\'\n\')}}" href="#/fabric/containers?cv={{$parent.version.id}}&cp={{row.entity.id}}{{hash}}">{{row.getProperty(col.field)}}</a></div>',
          width: 28
        },
        { 
          field: 'parentIds',
          displayName: 'Parent Profiles',
          cellTemplate: '<div class="ngCellText"><ul class="unstyled inline"><li ng-repeat="profile in row.entity.parentIds.sortBy()"><a href="#/fabric/profile/{{$parent.version.id}}/{{profile}}">{{profile}}</a></li></ul></div>',
          width: 400
        },
        {
          field: 'childIds',
          displayName: 'Child Profiles',
          cellTemplate: '<div class="ngCellText"><ul class="unstyled inline"><li ng-repeat="profile in row.entity.childIds.sortBy()"><a href="#/fabric/profile/{{$parent.version.id}}/{{profile}}">{{profile}}</a></li></ul></div>',
          width: 800
        }
        
      ]
    };

    $scope.deleteVersion = () => {

      // avoid getting any not found errors while deleting the version
      Core.unregister(jolokia, $scope);

      deleteVersion(jolokia, $scope.version.id, function() {
        notification('success', "Deleted version " + $scope.version.id);
        $scope.version = $scope.defaultVersion;
        $scope.$apply();
      }, function(response) {
        notification('error', "Failed to delete version " + $scope.version.id + " due to " + response.error);
        $scope.version = $scope.defaultVersion;
        $scope.$apply();
      });
    }

    $scope.deleteSelected = () => {
      $scope.selected.each(function(profile) {
        deleteProfile(jolokia, $scope.version.id, profile.id, function() {
          notification('success', "Deleted profile " + profile.id);
        }, function(response) {
          notification('error', "Failed to delete profile " + profile.id + ' due to ' + response.error);
        })
      });
    }

    function filterActive(data) {
      var rc = data;
      if ($scope.activeOnly) {
        rc = data.filter(function(item) {
          return item.containerCount > 0;
        });
      }
      return rc;
    }

    function render(response) {
      
      if (response.request.operation === 'versions') {
        
        if (!Object.equal($scope.versionResponse, response.value)) {
          $scope.versionResponse = response.value
          
          $scope.versions = response.value.map(function(version) {
            var v = {
              id: version.id,
              'defaultVersion': version.defaultVersion
            }

            if (v['defaultVersion']) {
              $scope.defaultVersion = v;
            }

            return v;
          });
          $scope.version = setSelect($scope.version, $scope.versions);
          
          $scope.$apply();
        }
        
      } else {
        if (!Object.equal($scope.profilesResponse, response.value)) {
          $scope.profilesResponse = response.value;
          $scope.profiles = [];
          
          $scope.profilesResponse.forEach(function(profile) {
            $scope.profiles.push({
              id: profile.id,
              parentIds: profile.parentIds,
              childIds: profile.childIds,
              containerCount: profile.containerCount,
              containers: profile.containers,
              locked: profile.locked,
              abstract: profile.abstractProfile
            })
          });

          $scope.profiles = filterActive($scope.profiles);
          $scope.$apply();
        }
      }
    }
  }
}
