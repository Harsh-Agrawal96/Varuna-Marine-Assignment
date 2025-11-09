import { Route, ComplianceRecord, BankEntry, Pool } from './domain';

export interface RouteRepository {
    getAll(year?: number): Promise<Route[]>;
    setBaseline(routeId: number, isBaseline: boolean): Promise<void>;
}

export interface ComplianceRepository {
    getForShip(shipId: string, year: number): Promise<ComplianceRecord | null>;
    save(record: ComplianceRecord): Promise<void>;
    // NEW: Atomically add to a compliance balance
    incrementCB(shipId: string, year: number, amount: number): Promise<void>;
}

export interface BankRepository {
    getAvailable(shipId: string): Promise<BankEntry[]>;
    bankSurplus(entry: BankEntry): Promise<void>;
    // NEW: Atomically use up banked amounts
    useAmount(shipId: string, amount: number): Promise<void>;
}

export interface PoolRepository {
    create(pool: Pool): Promise<number>;
}