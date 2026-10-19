import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-not-installed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="panel">
      <h1>Not installed yet</h1>
      <p>Run the web installer to connect a database and create your admin account.</p>
      <a class="btn primary" href="install/">Open the installer</a>
    </main>
  `,
  styles: `
    :host { display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 16px; }
    main { max-width: 420px; }
  `,
})
export class NotInstalledPage {}
