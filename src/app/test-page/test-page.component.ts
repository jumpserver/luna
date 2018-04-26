import {Component, OnInit} from '@angular/core';
import {DataStore, Video} from '../globals';

@Component({
  selector: 'app-test-page',
  templateUrl: './test-page.component.html',
  styleUrls: ['./test-page.component.scss']
})
export class TestPageComponent implements OnInit {
  zNodes = [
    {
      'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
      'key': '0:11:77',
      'name': '新节点 12',
      'value': '新节点 12',
      'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
      'assets_granted': [
        {
          'id': '1600ed6d-e3b6-434c-a960-c5bb818806b6',
          'hostname': 'windows1',
          'ip': '10.1.10.178',
          'port': 3389,
          'system_users_granted': [
            {
              'id': '8763b81a-bb5e-484a-abca-10514c7bb185',
              'name': '组织1-部门1-Administrator',
              'username': 'Administrator',
              'priority': 10,
              'protocol': 'rdp',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'Administrator',
          'os': null,
          'domain': null,
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Windows',
          'comment': ''
        },
        {
          'id': 'b952a481-a624-467e-b97f-9435155f0d53',
          'hostname': 'testserver',
          'ip': '10.1.10.192',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': 'CentOS',
          'domain': null,
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'key': '0',
              'value': 'Fit2cloud',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        },
        {
          'id': 'ad594b10-9f64-4913-b7b1-135fe63561d1',
          'hostname': 'ali-windows',
          'ip': '47.104.206.228',
          'port': 3389,
          'system_users_granted': [
            {
              'id': '8763b81a-bb5e-484a-abca-10514c7bb185',
              'name': '组织1-部门1-Administrator',
              'username': 'Administrator',
              'priority': 10,
              'protocol': 'rdp',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'Administrator',
          'os': null,
          'domain': null,
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'key': '0',
              'value': 'Fit2cloud',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Windows',
          'comment': ''
        },
        {
          'id': 'b6f16269-d02a-4055-9cd8-460fa10b1540',
          'hostname': 'test-vm3',
          'ip': '172.19.185.8',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': null,
          'domain': '8789580f-b5ca-4478-b6d3-d0dafc4c48e8',
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        },
        {
          'id': '27e50edc-52d9-41ef-8c9e-1bff9d1628b2',
          'hostname': 'test-vm2',
          'ip': '172.19.185.7',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': null,
          'domain': '8789580f-b5ca-4478-b6d3-d0dafc4c48e8',
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        },
        {
          'id': '9ef36bb3-1bed-455f-be09-3770d3f4bf97',
          'hostname': 'test-vm1',
          'ip': '172.19.185.6',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': null,
          'domain': '8789580f-b5ca-4478-b6d3-d0dafc4c48e8',
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        }
      ],
      'assets_amount': 6
    },
    {
      'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
      'key': '0:11',
      'name': '网域测试',
      'value': '网域测试',
      'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
      'assets_granted': [
        {
          'id': '1600ed6d-e3b6-434c-a960-c5bb818806b6',
          'hostname': 'windows1',
          'ip': '10.1.10.178',
          'port': 3389,
          'system_users_granted': [
            {
              'id': '8763b81a-bb5e-484a-abca-10514c7bb185',
              'name': '组织1-部门1-Administrator',
              'username': 'Administrator',
              'priority': 10,
              'protocol': 'rdp',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'Administrator',
          'os': null,
          'domain': null,
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Windows',
          'comment': ''
        },
        {
          'id': 'b952a481-a624-467e-b97f-9435155f0d53',
          'hostname': 'testserver',
          'ip': '10.1.10.192',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': 'CentOS',
          'domain': null,
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'key': '0',
              'value': 'Fit2cloud',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        },
        {
          'id': 'b6f16269-d02a-4055-9cd8-460fa10b1540',
          'hostname': 'test-vm3',
          'ip': '172.19.185.8',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': null,
          'domain': '8789580f-b5ca-4478-b6d3-d0dafc4c48e8',
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        },
        {
          'id': '27e50edc-52d9-41ef-8c9e-1bff9d1628b2',
          'hostname': 'test-vm2',
          'ip': '172.19.185.7',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': null,
          'domain': '8789580f-b5ca-4478-b6d3-d0dafc4c48e8',
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        },
        {
          'id': '9ef36bb3-1bed-455f-be09-3770d3f4bf97',
          'hostname': 'test-vm1',
          'ip': '172.19.185.6',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': null,
          'domain': '8789580f-b5ca-4478-b6d3-d0dafc4c48e8',
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        }
      ],
      'assets_amount': 5
    },
    {
      'id': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
      'key': '0',
      'name': 'Fit2cloud',
      'value': 'Fit2cloud',
      'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
      'assets_granted': [
        {
          'id': 'b952a481-a624-467e-b97f-9435155f0d53',
          'hostname': 'testserver',
          'ip': '10.1.10.192',
          'port': 22,
          'system_users_granted': [
            {
              'id': '7e326f71-aee5-4688-8cc1-717919470a09',
              'name': 'root',
              'username': 'root',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            },
            {
              'id': '17f384f4-683d-4944-a38d-db73608b92a9',
              'name': 'zbh-test',
              'username': 'zbh',
              'priority': 10,
              'protocol': 'ssh',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'root, zbh',
          'os': 'CentOS',
          'domain': null,
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'key': '0:11',
              'value': '网域测试',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'key': '0',
              'value': 'Fit2cloud',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Linux',
          'comment': ''
        },
        {
          'id': 'ad594b10-9f64-4913-b7b1-135fe63561d1',
          'hostname': 'ali-windows',
          'ip': '47.104.206.228',
          'port': 3389,
          'system_users_granted': [
            {
              'id': '8763b81a-bb5e-484a-abca-10514c7bb185',
              'name': '组织1-部门1-Administrator',
              'username': 'Administrator',
              'priority': 10,
              'protocol': 'rdp',
              'comment': ''
            }
          ],
          'is_active': true,
          'system_users_join': 'Administrator',
          'os': null,
          'domain': null,
          'nodes': [
            {
              'id': '67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6',
              'key': '0:11:77',
              'value': '新节点 12',
              'parent': '9c83d432-a353-4a4e-9fd9-be27a5851c2d',
              'assets_amount': 6,
              'is_asset': false
            },
            {
              'id': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'key': '0',
              'value': 'Fit2cloud',
              'parent': 'be9d9c3a-68d0-40ec-887c-5815d68e2f2c',
              'assets_amount': 6,
              'is_asset': false
            }
          ],
          'platform': 'Windows',
          'comment': ''
        }
      ],
      'assets_amount': 2
    }
  ];

  constructor() {
    DataStore.NavShow = false;
  }


  ngOnInit() {
    Video.id = 'asfafdasd';
    Video.src = 'https://www.w3schools.com/tags/movie.mp4';

  }

}
