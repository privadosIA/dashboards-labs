import { TestBed } from '@angular/core/testing';

import { provideAppDynamicForms } from '../../../shared/dynamic/dynamic-forms.providers';
import { SchemasByLang } from '../../../shared/dynamic/schema-loader';
import { schemaIssues, skeletonsDiffer } from '../../../shared/dynamic/testing/schema-checks';
import tablesEn from './tables.en.json';
import tablesEs from './tables.es.json';

describe('projects table schemas', () => {
  const byLang: SchemasByLang = { es: tablesEs, en: tablesEn };

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideAppDynamicForms()] }));

  it.each(['es', 'en'] as const)('%s respects the library contract', (lang) => {
    expect(schemaIssues(byLang[lang])).toEqual([]);
  });

  it('both languages have the same columns, order and conditions', () => {
    expect(skeletonsDiffer(byLang)).toBe(false);
  });
});
