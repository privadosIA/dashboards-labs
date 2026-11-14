import { EnvironmentProviders, Type, importProvidersFrom, makeEnvironmentProviders } from '@angular/core';
import { MAT_SELECT_CONFIG } from '@angular/material/select';
import { FORMLY_CONFIG } from '@ngx-formly/core';
import { DfOptionsProvider, DfValidatorDefinition, EN_TABLE_TEXTS, EN_VALIDATION_MESSAGES, materialTheme, provideDynamicForms } from '@core/dynamic-forms';
import { FormlyMaterialModule } from '@ngx-formly/material';

import { Lang } from './lang';

export interface LabFormsOptions {
  /** The language of the texts the library draws (validation messages, table texts). Spanish when absent. */
  lang?: Lang;
  /** Validators the application registers by alias, for schemas to reference. */
  validators?: DfValidatorDefinition[];
  /** Whether a hidden field loses its value (the library's default). Off keeps what a mode does not use. */
  defaultResetOnHide?: boolean;
  /** Answers the options of the fields that load them from an endpoint. */
  optionsProvider?: Type<DfOptionsProvider>;
}

/**
 * The one place that configures `@core/dynamic-forms` for the dashboards: the Material theme and the texts of the
 * language. An application adds this to its providers and does not configure the library itself.
 */
export function provideLabForms(options: LabFormsOptions = {}): EnvironmentProviders {
  const english = options.lang === 'en';
  return makeEnvironmentProviders([
    // The panel of every select is as wide as the field it opens from (not as wide as its longest option). Formly hands each select a `panelWidth` of its own, empty unless a field
    // says one, which would override Material's default, so the default is also set on Formly's select.
    { provide: MAT_SELECT_CONFIG, useValue: { panelWidth: 'auto' } },
    { provide: FORMLY_CONFIG, multi: true, useValue: { types: [{ name: 'select', defaultOptions: { props: { panelWidth: 'auto' } } }] } },
    provideDynamicForms({
    theme: materialTheme([importProvidersFrom(FormlyMaterialModule)]),
    // The library's own texts are Spanish; English is a ready-made set.
    ...(english ? { messages: EN_VALIDATION_MESSAGES, tableTexts: EN_TABLE_TEXTS } : {}),
    validators: options.validators ?? [],
    ...(options.defaultResetOnHide === undefined ? {} : { defaultResetOnHide: options.defaultResetOnHide }),
    ...(options.optionsProvider ? { optionsProvider: options.optionsProvider } : {}),
    }),
  ]);
}
