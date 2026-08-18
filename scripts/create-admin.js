const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

async function createSuperAdmin() {
    try {
        const phone = '7766968284';
        const rawPassword = 'superadmin123';
        const role = 'SUPERADMIN';

        console.log(`Checking if user ${phone} already exists...`);
        const existingUser = await prisma.user.findUnique({
            where: { phone }
        });

        if (existingUser) {
            console.log(`User with phone ${phone} already exists.`);
            process.exit(0);
        }

        console.log(`Hashing password...`);
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        console.log(`Creating superadmin...`);
        const superadmin = await prisma.user.create({
            data: {
                phone,
                password: hashedPassword,
                role,
                name: 'Super Admin',
                isActive: true
            }
        });

        console.log('\n✅ Superadmin created successfully!');
        console.log('-----------------------------------');
        console.log(`Phone:    ${superadmin.phone}`);
        console.log(`Password: ${rawPassword}`);
        console.log(`Role:     ${superadmin.role}`);
        console.log('-----------------------------------\n');

    } catch (error) {
        console.error('❌ Failed to create superadmin:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createSuperAdmin();
