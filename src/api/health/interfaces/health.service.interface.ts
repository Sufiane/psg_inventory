export type HealthStatus = {
    status: 'ok';
    db?: 'ok' | 'down';
};

export abstract class IHealthService {
    abstract check(checkDb: boolean): Promise<HealthStatus>;
}
