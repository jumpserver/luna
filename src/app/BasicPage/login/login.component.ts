import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';
import {AppService, DataStore, User} from '../../app.service';
import {NgForm} from '@angular/forms';

declare let jQuery: any;

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  providers: [AppService]
})
export class LoginComponent implements OnInit {
  DataStore = DataStore;
  User = User;
  loginBotton = 'login to your account';

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('login.ts:LoginComponent');
  }


  onSubmit(f: NgForm) {
    if (f.valid) {
      this._appService.login();
    } else {
      this._logger.error("the form not valid")
    }
  }

  ngOnInit() {
    jQuery('#form').fadeIn('slow');
    // this._router.navigate(['login']);
    // jQuery('nav').hide();
  }
}
