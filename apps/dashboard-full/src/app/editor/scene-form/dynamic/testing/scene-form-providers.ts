import { FakeMotionCatalogStore } from '../../../../core/motion-catalog.fake';
import { MotionCatalogStore } from '../../../../core/motion-catalog.store';
import { provideAppDynamicForms } from '../../../../shared/dynamic/dynamic-forms.providers';

/** What the app provides at its root for the forms, for a test that renders the scene form (and no catalog of parts to ask the server for). */
export const SCENE_FORM_TEST_PROVIDERS = [provideAppDynamicForms(), { provide: MotionCatalogStore, useClass: FakeMotionCatalogStore }];
