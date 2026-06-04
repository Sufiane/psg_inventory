export abstract class IHealthDbService {
    abstract ping(): Promise<boolean>;
}
