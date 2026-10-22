import { Component, HostListener, OnInit } from "@angular/core";
import { HttpService, I18nService, SettingService } from "@app/services";
import { EventManager } from "@angular/platform-browser";
import { useTheme } from "@src/sass/theme/util";

@Component({
  standalone: false,
  selector: "app-root",
  templateUrl: "app.component.html",
  styleUrls: ["app.component.css"],
})
export class AppComponent implements OnInit {
  constructor(
    _i18n: I18nService,
    private eventManager: EventManager,
    _setting: SettingService,
    private _http: HttpService
  ) {}

  @HostListener('document:keydown', ['$event'])
  @HostListener('document:pointerdown', ['$event'])
  @HostListener('document:pointermove', ['$event'])
  @HostListener('document:wheel', ['$event'])
  onUserActivity(event: Event): void {
    if (event.isTrusted) {
      this._http.renewSessionOnActivity();
    }
  }

  ngOnInit(): void {
    const { initTheme } = useTheme();
    initTheme();
    this.eventManager.addEventListener(window as unknown as HTMLElement, "keyup.esc", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    });
  }
}
