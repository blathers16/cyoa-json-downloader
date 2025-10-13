import { Component } from '@angular/core';
import { HeaderComponent } from './header/header.component';
import { FooterComponent } from './footer/footer.component';
import { CyoaDownloaderComponent } from './cyoa-downloader/cyoa-downloader.component';

@Component({
    selector: 'app-root',
    imports: [
        HeaderComponent,
        FooterComponent,
        CyoaDownloaderComponent
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'cyoa-json-downloader';
}
