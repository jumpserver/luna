import { Component, OnDestroy, OnInit } from '@angular/core';

@Component({
  standalone: false,
  selector: 'elements-filemanager',
  templateUrl: 'filemanager.component.html',
  styleUrls: ['filemanager.component.scss']
})
export class ElementFileManagerComponent implements OnInit, OnDestroy {
  ngOnInit(): void {
    console.log('FileManager init');
  }
  ngOnDestroy(): void {
    console.log('FileManager destroy');
  }
}
