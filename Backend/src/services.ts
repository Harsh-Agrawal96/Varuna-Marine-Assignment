import { Route, calculateIntensityDiff, allocatePool } from './domain';
import * as Ports from './ports';

export class RouteService {
    constructor(private repo: Ports.RouteRepository) {}

    async getRouteComparison(year: number) {
        const routes = await this.repo.getAll(year);
        const baseline = routes.find(r => r.is_baseline);
        if (!baseline) throw new Error("No baseline set for this year");

        return routes.map(r => ({
            ...r,
            percentDiff: calculateIntensityDiff(baseline.ghg_intensity, r.ghg_intensity),
            isCompliant: r.ghg_intensity <= baseline.ghg_intensity
        }));
    }

    async setBaseline(id: number) { return this.repo.setBaseline(id, true); }
}

export class ComplianceService {
    constructor(private complianceRepo: Ports.ComplianceRepository, private bankRepo: Ports.BankRepository) {}

    async getAdjustedCB(shipId: string, year: number) {
        const snapshot = await this.complianceRepo.getForShip(shipId, year);
        const currentCB = snapshot ? snapshot.cb_gco2eq : 0;
        const bankedEntries = await this.bankRepo.getAvailable(shipId);
        const totalBankedAvailable = bankedEntries.reduce((sum, e) => sum + (e.amount_gco2eq - e.amount_used), 0);

        return {
            year, shipId, raw_cb: currentCB, banked_available: totalBankedAvailable,
            adjusted_cb: currentCB + totalBankedAvailable,
            status: (currentCB + totalBankedAvailable) >= 0 ? 'COMPLIANT' : 'NON_COMPLIANT'
        };
    }

    async bankSurplus(shipId: string, year: number, amount: number) {
        const snapshot = await this.complianceRepo.getForShip(shipId, year);
        if (!snapshot || snapshot.cb_gco2eq < amount) throw new Error("Cannot bank more than available surplus.");
        await this.bankRepo.bankSurplus({ ship_id: shipId, year, amount_gco2eq: amount, amount_used: 0 });
    }

    async applyBankedSurplus(shipId: string, targetYear: number, amountToApply: number) {
        if (amountToApply <= 0) throw new Error("Amount must be positive");
        const adjusted = await this.getAdjustedCB(shipId, targetYear);
        if (adjusted.banked_available < amountToApply) throw new Error("Insufficient banked surplus.");

        await this.bankRepo.useAmount(shipId, amountToApply);
        await this.complianceRepo.incrementCB(shipId, targetYear, amountToApply);
    }
}

export class PoolService {
    constructor(private poolRepo: Ports.PoolRepository, private complianceRepo: Ports.ComplianceRepository) {}

    async createPool(year: number, shipIds: string[]) {
        const membersBefore: { ship_id: string, cb_before: number }[] = [];
        for (const shipId of shipIds) {
            const rec = await this.complianceRepo.getForShip(shipId, year);
            if (!rec) throw new Error(`Ship ${shipId} missing compliance record for ${year}`);
            membersBefore.push({ ship_id: shipId, cb_before: rec.cb_gco2eq });
        }
        const allocated = allocatePool(membersBefore);
        const poolId = await this.poolRepo.create({ year, members: allocated });
        return { pool_id: poolId, status: 'FORMED', members: allocated };
    }
}