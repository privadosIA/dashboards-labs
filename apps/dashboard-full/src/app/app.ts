import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ConnectionDialogService, ConnectionService } from '@lab/server-connection';

import { ActivityService } from './core/activity.service';
import { AppUpdateService } from './core/app-update.service';
import { AvailabilityStore } from './core/availability.store';
import { activeLang, chooseLang, Lang } from './core/language';
import { PhoneService } from './core/phone.service';
import { RoutingStore } from './core/routing.store';
import { ServerLinkService } from './core/server-link.service';
import { SimpleModeStore, allowedInSimple, allowedOnScreen } from './core/simple-mode.store';
import { ThemeService } from './core/theme.service';
import { AssistantStore } from './editor/assistant.store';
import { DescribeStore } from './editor/describe-reference/describe.store';
import { MusicAssistStore } from './music/music-assist.store';
import { ActionSheetService } from './shared/action-sheet/action-sheet.service';
import { NavItem, navItemActive } from './shell/nav-item';
import { SectionHeaderComponent } from './shell/section-header/section-header.component';
import { SectionWindow, sectionWindowFor, usesFullWidth } from './shell/section-windows';
import { StatusBannerComponent } from './shell/status-banner/status-banner.component';
import { Tab, TabBarComponent } from './shell/tab-bar/tab-bar.component';

/**
 * App shell: left navigation rail, slim toolbar carrying only the view
 * title, and the routed content. The rail collapses to an over-drawer at
 * phone width (CDK BreakpointObserver).
 */
const RAIL_KEY = 'lab-rail-open';

/** Open unless the person folded it away before (and unless storage cannot be read). */
function readRailOpen(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) !== '0';
  } catch {
    return true;
  }
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    MatSidenavModule,
    MatTooltipModule,
    MatToolbarModule,
    MatIconModule,
    MatListModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatSlideToggleModule,
    SectionHeaderComponent,
    StatusBannerComponent,
    TabBarComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly lang: Lang = activeLang();
  protected readonly theme = inject(ThemeService);
  protected readonly simpleMode = inject(SimpleModeStore);
  protected readonly conn = inject(ConnectionService);
  protected readonly connectionDialog = inject(ConnectionDialogService);
  private readonly router = inject(Router);
  private readonly routing = inject(RoutingStore);
  private readonly availability = inject(AvailabilityStore);

  /** The sections of the app, in the order of the menu. Each group of the migration adds the areas it brings. */
  protected readonly nav: NavItem[] = [
    { path: '/create', icon: 'mic', label: $localize`:@@nav.create:Create` },
    { path: '/projects', icon: 'video_library', label: $localize`:@@nav.projects:Projects` },
    { path: '/runs', icon: 'play_circle', label: $localize`:@@nav.runs:Runs` },
    { path: '/statistics', icon: 'insights', label: $localize`:@@nav.stats:Statistics` },
    { path: '/gallery', icon: 'photo_library', label: $localize`:@@nav.gallery:Gallery` },
    { path: '/library', icon: 'library_music', label: $localize`:@@nav.library:Library` },
    { path: '/models', icon: 'deployed_code', label: $localize`:@@nav.models:Models` },
    { path: '/environment', icon: 'memory', label: $localize`:@@nav.environment:Environment` },
    { path: '/api-docs', icon: 'api', label: $localize`:@@nav.api:API` },
    { path: '/settings', icon: 'settings', label: $localize`:@@nav.settings:Settings` },
  ];

  /** The sections the menu lists: only Create and Gallery in the simple version. */
  protected readonly visibleNav = computed(() => this.nav.filter((n) => (!this.simpleMode.simple() || allowedInSimple(n.path)) && (!this.phone() || allowedOnScreen(n.path))));

  protected setSimple(simple: boolean): void {
    this.simpleMode.set(simple);
    if (simple && !allowedInSimple(this.router.url)) void this.router.navigateByUrl('/create');
  }

  protected readonly phone = inject(PhoneService).phone;

  protected readonly drawerOpen = signal(false);

  /** Whether the side navigation is open on a desktop (the hamburger folds it away); the choice is remembered in this browser. */
  protected readonly railOpen = signal(readRailOpen());

  /** On a desktop the navigation can be folded to a column of icons. */
  protected readonly collapsed = computed(() => !this.phone() && !this.railOpen());

  protected readonly connectionLabel = $localize`:@@shell.connection:Connection`;

  protected setRailOpen(open: boolean): void {
    this.railOpen.set(open);
    try {
      localStorage.setItem(RAIL_KEY, open ? '1' : '0');
    } catch {
      // Storage may be blocked: the choice then lasts until the page is closed.
    }
  }

  /**
   * The section whose window this address is (Animation, Video or Music), if any: a window has no side navigation, no tab bar and no drawer,
   * only a slim header. It starts from the browser's address so that the first paint is already the right one.
   */
  protected readonly section = signal<SectionWindow | undefined>(sectionWindowFor(inject(Location).path()));

  /** The address the app is on, to tell which entry of the navigation is the current one. */
  private readonly url = signal(inject(Location).path());
  /** An editor and Animation take the whole width: seeing every element is the point of them. */
  protected readonly wide = computed(() => usesFullWidth(this.url()));

  protected isActive(item: NavItem): boolean {
    return navItemActive(item, this.url());
  }

  /** A phone in the simple version gets the app shell: a bar of tabs at the bottom instead of the drawer. */
  protected readonly mobileShell = computed(() => this.phone() && this.simpleMode.simple());
  protected readonly tabs = computed<Tab[]>(() => this.visibleNav().map(({ path, icon, label }) => ({ path, icon, label })));
  protected readonly moreLabel = $localize`:@@shell.more:More`;
  private readonly sheet = inject(ActionSheetService);

  /** The sheet of the "More" tab: what the drawer keeps at its foot (connection, language, theme, advanced version). */
  protected openMore(): void {
    const light = this.theme.light();
    this.sheet.open(this.moreLabel, [
      { icon: 'lan', label: $localize`:@@shell.connection:Connection`, run: () => this.connectionDialog.open() },
      { icon: 'translate', label: 'English', selected: this.lang === 'en', run: () => this.setLang('en') },
      { icon: 'translate', label: 'Español', selected: this.lang === 'es', run: () => this.setLang('es') },
      {
        icon: light ? 'dark_mode' : 'light_mode',
        label: light ? $localize`:@@shell.darkTheme:Dark theme` : $localize`:@@shell.lightTheme:Light theme`,
        run: () => this.theme.set(!light),
      },
      { icon: 'tune', label: $localize`:@@shell.advanced:Advanced version`, run: () => this.setSimple(false) },
    ]);
  }

  private readonly documentTitle = inject(Title);

  constructor() {
    // The local long tasks count as "something is running" (one process at a time).
    const activity = inject(ActivityService);
    const assistant = inject(AssistantStore);
    const describe = inject(DescribeStore);
    const musicAssist = inject(MusicAssistStore);
    effect(() => activity.track('assistant', assistant.busy() !== null));
    effect(() => activity.track('describe', describe.busy() !== null));
    effect(() => activity.track('music-assist', musicAssist.busy() !== null));
    void this.routing.load(); // which tasks run on a remote provider, for the badges
    void this.availability.load(); // which model tasks can run now, so the controls that cannot work are not offered
    this.availability.watchFocus();
    inject(ServerLinkService).watch(); // says so when the server cannot be reached
    inject(AppUpdateService).watch(); // offers the new build when the server has one
    // The page title is the page's own header; the browser tab carries it too.
    this.router.events.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.url.set(this.router.url);
        this.section.set(sectionWindowFor(this.router.url));
        this.documentTitle.setTitle(`${this.currentTitle()} · mediaOrquestator`);
      }
    });
  }

  private currentTitle(): string {
    const url = this.router.url;
    const section = sectionWindowFor(url);
    if (section) return section.title;
    const item = this.nav.find((n) => navItemActive(n, url));
    return item?.label ?? $localize`:@@nav.projects:Projects`;
  }

  protected onNavClick(): void {
    if (this.phone()) {
      this.drawerOpen.set(false);
    }
  }

  /** Chooses the UI language; the page reloads on the same route. */
  protected setLang(lang: Lang): void {
    if (lang !== this.lang) chooseLang(lang);
  }
}
