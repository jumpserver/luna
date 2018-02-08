import {Component, OnInit} from '@angular/core';
import {FormBuilder, FormGroup} from '@angular/forms';

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
      'label': '',
      'link': '/'
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
          'name': 'Task',
          'link': '/task'
        },
      ]
    },
    {
      'name': 'Settings',
      'class': 'fa fa-gears',
      'label': '',
      'link': '/luna/setting'
    },
  ];
  options: FormGroup;
  active: number;
  active2: number;

  constructor(fb: FormBuilder) {
    this.options = fb.group({
      'fixed': true,
      'top': 0,
      'bottom': 0,
    });
  }


  ngOnInit() {
    this.active = 6;
    this.active2 = 0;
  }

  gotoLink(link: string, index: number, index2: number) {
    if (link) {
      window.location.href = link;
    }
    this.active = index;
    this.active2 = index2;
  }
}
