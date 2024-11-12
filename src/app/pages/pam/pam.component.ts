import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {animate, state, style, transition, trigger} from '@angular/animations';
import {MatSidenav} from '@angular/material/sidenav';

export interface PeriodicElement {
  name: string;
  position: number;
  weight: number;
  symbol: string;
}

const ELEMENT_DATA: PeriodicElement[] = [
  {
    position: 1,
    name: 'Hydrogen',
    weight: 1.0079,
    symbol: 'H',
  },
  {
    position: 2,
    name: 'Helium',
    weight: 4.0026,
    symbol: 'He',
  },
  {
    position: 3,
    name: 'Lithium',
    weight: 6.941,
    symbol: 'Li',
  },
  {
    position: 4,
    name: 'Beryllium',
    weight: 9.0122,
    symbol: 'Be',
  },
  {
    position: 5,
    name: 'Boron',
    weight: 10.811,
    symbol: 'B',
  }
];

@Component({
  selector: 'pages-pam',
  templateUrl: './pam.component.html',
  styleUrls: ['./pam.component.scss'],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({height: '0px', minHeight: '0', display: 'none'})),
      state('expanded', style({height: '*'})),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class PagePamComponent implements OnInit, OnDestroy {
  @ViewChild('sidenav', {static: false}) sidenav: MatSidenav;

  public isActive: boolean = false;
  public connectType: string = 'SSH';

  public totalConnectTime: string;
  private startTime: Date;
  private timerInterval: any;

  dataSource = ELEMENT_DATA;
  columnsToDisplay = ['name', 'weight', 'symbol', 'position'];
  expandedElement: PeriodicElement | null;

  constructor() {}

  ngOnInit(): void {
    this.startTime = new Date();
    this.updateConnectTime();

    this.timerInterval = setInterval(() => {
      this.updateConnectTime();
      this.isActive = !this.isActive;
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  public closeDrawer() {
    this.sidenav.close();
  }

  /**
   * @description 计算页面打开时间
   * @private
   */
  private updateConnectTime(): void {
    const currentTime = new Date();
    const elapsed = currentTime.getTime() - this.startTime.getTime();

    const hours = Math.floor((elapsed / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((elapsed / (1000 * 60)) % 60);
    const seconds = Math.floor((elapsed / 1000) % 60);

    this.totalConnectTime = `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(seconds)}`;
  }

  private padZero(value: number): string {
    return String(value).padStart(2, '0');
  }

}
