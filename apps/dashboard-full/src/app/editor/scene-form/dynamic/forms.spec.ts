import { SchemasByLang } from '../../../shared/dynamic/schema-loader';
import { schemaIssues, skeletonsDiffer } from '../../../shared/dynamic/testing/schema-checks';
import { SCENE_VALIDATORS } from './validations';
import { TestBed } from '@angular/core/testing';
import { ValidatorRegistryService } from '@core/dynamic-forms';
import { provideAppDynamicForms } from '../../../shared/dynamic/dynamic-forms.providers';
import formsEn from './forms.en.json';
import formsEs from './forms.es.json';

describe('scene form schemas', () => {
  const byLang: SchemasByLang = { es: formsEs, en: formsEn };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppDynamicForms()] });
    SCENE_VALIDATORS.forEach((v) => TestBed.inject(ValidatorRegistryService).register(v));
  });

  it.each(['es', 'en'] as const)('%s respects the library contract', (lang) => {
    expect(schemaIssues(byLang[lang])).toEqual([]);
  });

  it('both languages have the same fields, order and conditions', () => {
    expect(skeletonsDiffer(byLang)).toBe(false);
  });
});
