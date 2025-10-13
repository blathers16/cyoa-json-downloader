import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CyoaDownloaderComponent } from './cyoa-downloader.component';

describe('CyoaDownloaderComponent', () => {
  let component: CyoaDownloaderComponent;
  let fixture: ComponentFixture<CyoaDownloaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CyoaDownloaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CyoaDownloaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
