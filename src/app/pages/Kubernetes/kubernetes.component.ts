import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';

@Component({
  selector: 'pages-kubernetes',
  templateUrl: './kubernetes.component.html',
})
export class PagesKubernetesComponent implements OnInit {
  @ViewChild('iFrame', { static: false }) iframeRef: ElementRef;

  public token: string = '';
  public iframeURL: string = '';

  constructor(private _route: ActivatedRoute) {}

  ngOnInit(): void {
    // const baseUrl = `${window.location.protocol}//${window.location.host}`;
    const baseUrl = `http://localhost:9530`;

    this._route.params.subscribe((params: Params) => {
      this.token = params['token'];
    });

    this.iframeURL = `${baseUrl}/koko/k8s/?token=${this.token}`;
  }
}
