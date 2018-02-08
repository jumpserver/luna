import {Component, OnInit} from '@angular/core';

@Component({
  selector: 'app-element-leftbar',
  templateUrl: './leftbar.component.html',
  styleUrls: ['./leftbar.component.scss']
})
export class ElementLeftbarComponent implements OnInit {
  leftbar = [
    {
      'name': 'Dashboard',
      'class': 'fa fa-dashboard',
      'label': 'label label-info pull-right'
    },
    {
      'name': 'Users',
      'class': 'fa fa-group',
      'label': 'fa arrow',
      'child': [
        {
          'name': 'User',
        }, {
          'name': 'User group',
        }, {
          'name': 'Login logs',
        }
      ]
    },
    {
      'name': 'Assets',
      'class': 'fa fa-inbox',
      'label': 'fa arrow',
      'child': [
        {
          'name': 'Asset',
        }, {
          'name': 'Asset group',
        }, {
          'name': 'Cluster',
        }, {
          'name': 'Admin user',
        }, {
          'name': 'System user',
        }, {
          'name': 'Labels',
        }
      ]
    },
    {
      'name': 'Perms',
      'class': 'fa fa-edit',
      'label': 'fa arrow',
      'child': [{'name': 'Asset permission'}]
    },
    {
      'name': 'Sessions',
      'class': 'fa fa-rocket',
      'label': 'fa arrow',
      'child': [
        {
          'name': 'Session online'
        },
        {
          'name': 'Session offline'
        },
        {
          'name': 'Commands'
        },
        {
          'name': 'Terminal'
        },
      ]
    },
    {
      'name': 'Job Center',
      'class': 'fa fa-coffee',
      'label': 'fa arrow',
      'child': [
        {
          'name': 'Task'
        },
      ]
    },
    {
      'name': 'Settings',
      'class': 'fa fa-gears',
      'label': 'label label-info pull-right'
    },
  ];

  constructor() {
  }

  ngOnInit() {
  }

}
