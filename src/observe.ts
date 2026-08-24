import { createObserveModule } from '@nestjs/observe';

// ObserveModule is registered in app.module.ts, only when
// OBSERVE_APP_KEY/OBSERVE_APP_SECRET are set. ObserveInstrument is passed to
// NestFactory.create in main.ts, which needs a workaround for a helmet
// registration conflict — see the comment there.
export const { ObserveModule, ObserveInstrument } = createObserveModule();
