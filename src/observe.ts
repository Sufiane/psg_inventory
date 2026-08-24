import { createObserveModule } from '@nestjs/observe';

// ObserveModule is registered in app.module.ts, only when
// OBSERVE_APP_KEY/OBSERVE_APP_SECRET are set.
//
// ObserveInstrument is intentionally NOT wired into main.ts's
// NestFactory.create — passing it breaks `app.use(helmet())` (Express's
// router.use() throws "argument handler must be a function"), reproduced
// with and without real credentials. Re-enable it there once that's fixed
// upstream (@nestjs/observe is 0.1.3 as of writing).
export const { ObserveModule, ObserveInstrument } = createObserveModule();
