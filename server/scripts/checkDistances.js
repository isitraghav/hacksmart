const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'hacksmart',
    password: process.env.DB_PASSWORD || '123456789',
    port: process.env.DB_PORT || 5432
});

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function checkDistances() {
    try {
        // Get all partners
        const partnersRes = await pool.query('SELECT id, latitude, longitude FROM partners');
        const partners = partnersRes.rows;

        // Get all warehouses
        const warehousesRes = await pool.query('SELECT id, name, latitude, longitude FROM warehouses');
        const warehouses = warehousesRes.rows;

        console.log(`\n📊 Checking distances for ${partners.length} partners and ${warehouses.length} warehouses\n`);

        // Find min/max distances for each partner
        const problematicPartners = [];
        partners.forEach(partner => {
            const distances = warehouses.map(wh => ({
                warehouseId: wh.id,
                warehouseName: wh.name,
                distance: haversineDistance(partner.latitude, partner.longitude, wh.latitude, wh.longitude)
            }));

            const minDistance = Math.min(...distances.map(d => d.distance));
            const closestWarehouse = distances.find(d => d.distance === minDistance);

            if (minDistance > 30) {
                problematicPartners.push({
                    partnerId: partner.id,
                    minDistance: minDistance.toFixed(2),
                    closestWarehouse: closestWarehouse.warehouseName
                });
            }
        });

        if (problematicPartners.length === 0) {
            console.log('✅ All partners are within 30km of at least one warehouse!');
        } else {
            console.log(`⚠️  ${problematicPartners.length} partners beyond 30km from all warehouses:\n`);
            problematicPartners.slice(0, 10).forEach(p => {
                console.log(`   ${p.partnerId}: ${p.minDistance}km from ${p.closestWarehouse}`);
            });
            if (problematicPartners.length > 10) {
                console.log(`   ... and ${problematicPartners.length - 10} more`);
            }
        }

        // Check critical threshold (45km)
        const criticalPartners = problematicPartners.filter(p => parseFloat(p.minDistance) > 45);
        if (criticalPartners.length > 0) {
            console.log(`\n🚨 ${criticalPartners.length} partners beyond 45km (critical threshold):\n`);
            criticalPartners.slice(0, 5).forEach(p => {
                console.log(`   ${p.partnerId}: ${p.minDistance}km from ${p.closestWarehouse}`);
            });
        }

        // Calculate coverage statistics
        const within10km = partners.filter(p => {
            const minDist = Math.min(...warehouses.map(wh => 
                haversineDistance(p.latitude, p.longitude, wh.latitude, wh.longitude)
            ));
            return minDist <= 10;
        }).length;

        const within20km = partners.filter(p => {
            const minDist = Math.min(...warehouses.map(wh => 
                haversineDistance(p.latitude, p.longitude, wh.latitude, wh.longitude)
            ));
            return minDist <= 20;
        }).length;

        const within30km = partners.filter(p => {
            const minDist = Math.min(...warehouses.map(wh => 
                haversineDistance(p.latitude, p.longitude, wh.latitude, wh.longitude)
            ));
            return minDist <= 30;
        }).length;

        console.log(`\n📈 Coverage Statistics:`);
        console.log(`   Within 10km: ${within10km}/${partners.length} (${(within10km/partners.length*100).toFixed(1)}%)`);
        console.log(`   Within 20km: ${within20km}/${partners.length} (${(within20km/partners.length*100).toFixed(1)}%)`);
        console.log(`   Within 30km: ${within30km}/${partners.length} (${(within30km/partners.length*100).toFixed(1)}%)`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkDistances();
