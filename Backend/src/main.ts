import express from 'express';
import { Pool as PgPool } from 'pg';
import * as dotenv from 'dotenv';
import { PgRouteRepository, PgComplianceRepository, PgBankRepository, PgPoolRepository } from './postgres_adapter';
import { RouteService, ComplianceService, PoolService } from './services';

dotenv.config();

const app = express();
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    next();
});

const db = new PgPool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/fueleu' });

const routeRepo = new PgRouteRepository(db);
const complianceRepo = new PgComplianceRepository(db);
const bankRepo = new PgBankRepository(db);
const poolRepo = new PgPoolRepository(db);

const routeService = new RouteService(routeRepo);
const complianceService = new ComplianceService(complianceRepo, bankRepo);
const poolService = new PoolService(poolRepo, complianceRepo);

// === API ENDPOINTS ===
app.get('/routes', async (req, res) => {
    try { res.json(await routeRepo.getAll(req.query.year ? Number(req.query.year) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/routes/:id/baseline', async (req, res) => {
    try { await routeService.setBaseline(Number(req.params.id)); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/routes/comparison', async (req, res) => {
    try { res.json(await routeService.getRouteComparison(Number(req.query.year) || 2025)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/compliance/cb', async (req, res) => {
    try {
        const cb = await complianceRepo.getForShip(String(req.query.shipId), Number(req.query.year));
        res.json(cb || { ship_id: req.query.shipId, year: Number(req.query.year), cb_gco2eq: 0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/compliance/adjusted-cb', async (req, res) => {
    try { res.json(await complianceService.getAdjustedCB(String(req.query.shipId), Number(req.query.year))); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/banking/bank', async (req, res) => {
    try {
        await complianceService.bankSurplus(req.body.shipId, req.body.year, req.body.amount);
        res.json({ success: true, message: `Banked ${req.body.amount} for ${req.body.shipId}` });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/banking/apply', async (req, res) => {
    try {
        await complianceService.applyBankedSurplus(req.body.shipId, Number(req.body.year), Number(req.body.amount));
        res.json({ success: true, message: `Applied ${req.body.amount} to ${req.body.shipId}` });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/pools', async (req, res) => {
    try { res.json(await poolService.createPool(req.body.year, req.body.shipIds)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));