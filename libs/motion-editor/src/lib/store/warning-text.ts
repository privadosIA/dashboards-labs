import type { MotionEditorTexts } from '../texts';
import type { Warning } from './checks';

/** A warning in words, in the language of `t`. */
export function warningText(t: MotionEditorTexts, w: Warning): string {
  const x = t.warnings;
  const part = w.part ?? '';
  const param = w.param ?? '';
  switch (w.kind) {
    case 'coverage':
      return x.coverage;
    case 'unknown-part':
      return x.unknownPart(part);
    case 'param-type':
      return x.paramType(param);
    case 'param-range':
      return x.paramRange(param, w.limit ?? 0);
    case 'param-length':
      return x.paramLength(param, w.limit ?? 0);
    case 'param-option':
      return x.paramOption(param);
    case 'extras-count':
      return x.extrasCount(w.limit ?? 0);
    case 'extras-repeat':
      return x.extrasRepeat(part);
    case 'keyword':
      return x.keyword(w.text ?? '');
    case 'hit-word':
      return x.hitWord(w.text ?? '');
    case 'level':
      return x.level(part, w.text ?? '');
    case 'animate-unsupported':
      return x.animateUnsupported;
    case 'layers-unsupported':
      return x.layersUnsupported;
    case 'layer-problem':
      // the server's own sentence, which stays in its words
      return w.text ?? '';
  }
}
