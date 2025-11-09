// === DOMAIN LAYER: Entities & Pure Business Logic ===

export interface Route {
    id?: number;
    route_id: string;
    year: number;
    vessel_type?: string;        // NEW
    fuel_type?: string;          // NEW
    ghg_intensity: number;
    fuel_consumption_t?: number; // NEW
    distance_km?: number;        // NEW
    total_emissions_t?: number;  // NEW
    is_baseline: boolean;
}

export interface ComplianceRecord {
    ship_id: string;
    year: number;
    cb_gco2eq: number;
}

export interface BankEntry {
    id?: number;
    ship_id: string;
    year: number;
    amount_gco2eq: number;
    amount_used: number; // NEW
}

export interface PoolMember {
    ship_id: string;
    cb_before: number;
    cb_after: number;
}

export interface Pool {
    id?: number;
    year: number;
    members: PoolMember[];
}

// -- Pure Domain Logic --

export const REGULATORY_TARGET_2025 = 91.16;

// NEW: Implements ((comparison / baseline) - 1) * 100
export function calculateIntensityDiff(baseline: number, comparison: number): number {
     return ((comparison / baseline) - 1) * 100;
}

export function calculateCB(actualIntensity: number, energyMj: number = 1e6, target: number = REGULATORY_TARGET_2025): number {
    return (target - actualIntensity) * energyMj;
}

export function allocatePool(members: { ship_id: string, cb_before: number }[]): PoolMember[] {
    const totalCb = members.reduce((sum, m) => sum + m.cb_before, 0);
    if (totalCb < -0.001) throw new Error("Pool Validation Failed: Total CB is negative.");

    let poolMembers: PoolMember[] = members.map(m => ({ ...m, cb_after: m.cb_before }));
    poolMembers.sort((a, b) => b.cb_before - a.cb_before);

    let surplusIdx = 0;
    let deficitIdx = poolMembers.length - 1;

    while (surplusIdx < deficitIdx) {
        let donor = poolMembers[surplusIdx];
        let receiver = poolMembers[deficitIdx];

        if (receiver.cb_after >= 0) { deficitIdx--; continue; }
        if (donor.cb_after <= 0) { surplusIdx++; continue; }

        const transfer = Math.min(Math.abs(receiver.cb_after), donor.cb_after);
        donor.cb_after -= transfer;
        receiver.cb_after += transfer;

        if (donor.cb_after <= 0.001) surplusIdx++;
        if (receiver.cb_after >= -0.001) deficitIdx--;
    }

    poolMembers.forEach(m => {
         if (m.cb_before < 0 && m.cb_after < m.cb_before) throw new Error(`Invariant failed: Deficit ship ${m.ship_id} exited worse.`);
         if (m.cb_before > 0 && m.cb_after < 0) throw new Error(`Invariant failed: Surplus ship ${m.ship_id} exited negative.`);
    });
    return poolMembers;
}