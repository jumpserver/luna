import { Component, OnInit } from "@angular/core";
import { I18nService } from "@app/services";
import { EventManager } from "@angular/platform-browser";
import { useTheme } from "@src/sass/theme/util";

@Component({
  standalone: false,
  selector: "app-root",
  templateUrl: "app.component.html",
  styleUrls: ["app.component.css"],
})
export class AppComponent implements OnInit {
  constructor(_i18n: I18nService, private eventManager: EventManager) {}

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
