// Reporter phụ cho web "Chạy luồng": in một dòng máy-đọc-được cho mỗi test.step để web vẽ tiến độ từng bước.
export default class StepReporter {
  onStepBegin(_test, _result, step) {
    if (step.category === 'test.step' && !step.parent) console.log(`##STEP|begin|${step.title}`);
  }
  onStepEnd(_test, _result, step) {
    if (step.category === 'test.step' && !step.parent) console.log(`##STEP|end|${step.title}|${step.error ? 'fail' : 'ok'}|${step.duration}`);
  }
  onTestBegin(test) {
    console.log(`##TEST|begin|${test.title}`);
  }
  onTestEnd(test, result) {
    console.log(`##TEST|end|${test.title}|${result.status}|${result.duration}`);
  }
  printsToStderr() {
    return false;
  }
}
