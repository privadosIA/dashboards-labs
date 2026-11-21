import { EnvironmentProviders } from '@angular/core';
import { DfValidatorDefinition } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

import { Lang, activeLang } from '../../core/language';
import { AppOptionsProvider } from './option-sources';

/**
 * The dashboard's setup of the form library, over `provideLabForms`: the texts of the active language, the validators every
 * component registers and the options provider that answers from the option-source registry. Components register what
 * only they know at runtime: validators in the library's `ValidatorRegistryService`, option sources in the
 * `OptionSourceRegistry`. Look and feel come from the `--lab-*` tokens (`src/theme/_forms.scss`).
 */
export function provideAppDynamicForms(options: { validators?: DfValidatorDefinition[]; lang?: Lang } = {}): EnvironmentProviders {
  return provideLabForms({
    lang: options.lang ?? activeLang(),
    validators: options.validators ?? [],
    // A field that is hidden keeps its value: the editor has always kept what a mode does not use.
    defaultResetOnHide: false,
    optionsProvider: AppOptionsProvider,
  });
}
