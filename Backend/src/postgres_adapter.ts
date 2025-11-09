import { Pool as PgPool } from 'pg';
import * as Domain from './domain';
import * as Ports from './ports';

export class PgRouteRepository implements Ports.RouteRepository {
    constructor(private db: PgPool) {}

    async getAll(year?: number): Promise<Domain.Route[]> {
        const sql = year
            ? `SELECT * FROM routes WHERE year = $1 ORDER BY route_id`
            : `SELECT * FROM routes ORDER BY year, route_id`;
        const res = await this.db.query(sql, year ? [year] : []);
        return res.rows;
    }

    async setBaseline(id: number, isBaseline: boolean): Promise<void> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            if (isBaseline) {
                 const r = await client.query('SELECT year FROM routes WHERE id = $1', [id]);
                 if (r.rows.length > 0) {
                     await client.query('UPDATE routes SET is_baseline = false WHERE year = $1', [r.rows[0].year]);
                 }
            }
            await client.query(`UPDATE routes SET is_baseline = $1 WHERE id = $2`, [isBaseline, id]);
            await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
}

export class PgComplianceRepository implements Ports.ComplianceRepository {
    constructor(private db: PgPool) {}

    async getForShip(shipId: string, year: number): Promise<Domain.ComplianceRecord | null> {
        const res = await this.db.query(`SELECT * FROM ship_compliance WHERE ship_id = $1 AND year = $2`, [shipId, year]);
        return res.rows[0] || null;
    }

    async save(record: Domain.ComplianceRecord): Promise<void> {
        await this.db.query(
            `INSERT INTO ship_compliance (ship_id, year, cb_gco2eq) VALUES ($1, $2, $3)
             ON CONFLICT (ship_id, year) DO UPDATE SET cb_gco2eq = EXCLUDED.cb_gco2eq`,
            [record.ship_id, record.year, record.cb_gco2eq]
        );
    }

    async incrementCB(shipId: string, year: number, amount: number): Promise<void> {
        await this.db.query(
            `INSERT INTO ship_compliance (ship_id, year, cb_gco2eq) VALUES ($1, $2, $3)
             ON CONFLICT (ship_id, year) DO UPDATE SET cb_gco2eq = ship_compliance.cb_gco2eq + $3`,
            [shipId, year, amount]
        );
    }
}

export class PgBankRepository implements Ports.BankRepository {
    constructor(private db: PgPool) {}

    async getAvailable(shipId: string): Promise<Domain.BankEntry[]> {
        const res = await this.db.query(`SELECT * FROM bank_entries WHERE ship_id = $1 AND amount_used < amount_gco2eq`, [shipId]);
        return res.rows;
    }

    async bankSurplus(entry: Domain.BankEntry): Promise<void> {
        await this.db.query(
            `INSERT INTO bank_entries (ship_id, year, amount_gco2eq, amount_used) VALUES ($1, $2, $3, $4)`,
            [entry.ship_id, entry.year, entry.amount_gco2eq, entry.amount_used || 0]
        );
    }

    async useAmount(shipId: string, amountToUse: number): Promise<void> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const res = await client.query(
                `SELECT id, amount_gco2eq, amount_used FROM bank_entries
                 WHERE ship_id = $1 AND amount_used < amount_gco2eq
                 ORDER BY year ASC FOR UPDATE`, [shipId]
            );
            let remaining = amountToUse;
            for (const row of res.rows) {
                if (remaining <= 0) break;
                const take = Math.min(row.amount_gco2eq - row.amount_used, remaining);
                await client.query(`UPDATE bank_entries SET amount_used = amount_used + $1 WHERE id = $2`, [take, row.id]);
                remaining -= take;
            }
            if (remaining > 0.001) throw new Error("Insufficient bank funds.");
            await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
}

export class PgPoolRepository implements Ports.PoolRepository {
    constructor(private db: PgPool) {}

    async create(pool: Domain.Pool): Promise<number> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const poolRes = await client.query(`INSERT INTO pools (year) VALUES ($1) RETURNING id`, [pool.year]);
            const poolId = poolRes.rows[0].id;
            for (const member of pool.members) {
                await client.query(
                    `INSERT INTO pool_members (pool_id, ship_id, cb_before, cb_after) VALUES ($1, $2, $3, $4)`,
                    [poolId, member.ship_id, member.cb_before, member.cb_after]
                );
            }
            await client.query('COMMIT');
            return poolId;
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
}