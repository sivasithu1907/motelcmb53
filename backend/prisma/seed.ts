import { PrismaClient, RoomStatus, BookingStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createId } from '@paralleldrive/cuid2';
import { addDays, subDays, format } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Motel CMB 53 database...');

  // Clean up
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.bookingCharge.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.guestDocument.deleteMany(),
    prisma.guest.deleteMany(),
    prisma.roomStatusHistory.deleteMany(),
    prisma.room.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.userBuildingAccess.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.invoiceSequence.deleteMany(),
    prisma.bookingSequence.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.building.deleteMany(),
    prisma.organization.deleteMany(),
  ]);

  // Organization
  const org = await prisma.organization.create({
    data: {
      id: 'org-cmb53',
      name: 'TheDreamV Hospitality',
      code: 'TDV-001',
      status: 'Active',
      subscriptionStatus: 'Active',
    },
  });

  // Buildings
  const building = await prisma.building.create({
    data: {
      id: 'bld-cmb53',
      organizationId: org.id,
      code: 'CMB-53',
      name: 'Motel CMB – 53',
      address: 'No. 53, Panchikawatta Road, Maradana, Colombo 10',
      contactNumbers: ['0112 323 728', '077 771 5178', '075 771 5178'],
      isActive: true,
      bookingPrefix: 'BKG',
      invoicePrefix: 'INV',
    },
  });

  await prisma.building.createMany({
    data: [
      { organizationId: org.id, code: 'BLD-02', name: 'Building 2 (Placeholder)', address: 'TBC', isActive: false },
      { organizationId: org.id, code: 'BLD-03', name: 'Building 3 (Placeholder)', address: 'TBC', isActive: false },
      { organizationId: org.id, code: 'BLD-04', name: 'Building 4 (Placeholder)', address: 'TBC', isActive: false },
    ],
  });

  // Initialize sequences
  await prisma.bookingSequence.create({ data: { buildingId: building.id, lastNumber: 3 } });
  await prisma.invoiceSequence.create({ data: { buildingId: building.id, lastNumber: 1 } });

  // Rooms
  const roomDefs = [
    { number: '1',  capacity: 6, nonAcRate: 8000, acSurcharge: 2500 },
    { number: '2',  capacity: 6, nonAcRate: 8000, acSurcharge: 2500 },
    { number: '3',  capacity: 2, nonAcRate: 5000, acSurcharge: 2500, status: 'Cleaning' as RoomStatus },
    { number: '4',  capacity: 2, nonAcRate: 5000, acSurcharge: 2500 },
    { number: '5',  capacity: 2, nonAcRate: 5000, acSurcharge: 2500, status: 'Reserved' as RoomStatus },
    { number: '6',  capacity: 2, nonAcRate: 5000, acSurcharge: 2500, status: 'Maintenance' as RoomStatus },
    { number: '7',  capacity: 2, nonAcRate: 5000, acSurcharge: 2500 },
    { number: '8',  capacity: 6, nonAcRate: 8000, acSurcharge: 2500 },
    { number: '9',  capacity: 6, nonAcRate: 8000, acSurcharge: 2500, status: 'Occupied' as RoomStatus },
    { number: '10', capacity: 6, nonAcRate: 8000, acSurcharge: 2500 },
    { number: '11', capacity: 2, nonAcRate: 5000, acSurcharge: 2500 },
    { number: '12', capacity: 3, nonAcRate: 5500, acSurcharge: 2500 },
  ];

  const rooms: any[] = [];
  for (const def of roomDefs) {
    const room = await prisma.room.create({
      data: {
        buildingId: building.id,
        number: def.number,
        capacity: def.capacity,
        nonAcRate: def.nonAcRate,
        acSurcharge: def.acSurcharge,
        status: (def.status as RoomStatus) || 'Vacant',
      },
    });
    rooms.push(room);
  }

  const roomMap = Object.fromEntries(rooms.map((r) => [r.number, r]));

  // Users
  const hashPw = async (pw: string) => argon2.hash(pw);

  const adminUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Admin User',
      email: 'admin@motelcmb53.lk',
      passwordHash: await hashPw('Admin@2025!'),
      role: 'OwnerAdmin',
      isActive: true,
      buildingAccess: { create: { buildingId: building.id } },
    },
  });

  const managerUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Manager Silva',
      email: 'manager@motelcmb53.lk',
      passwordHash: await hashPw('Manager@2025!'),
      role: 'BuildingManager',
      isActive: true,
      buildingAccess: { create: { buildingId: building.id } },
    },
  });

  const operatorUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Operator Perera',
      email: 'operator@motelcmb53.lk',
      passwordHash: await hashPw('Operator@2025!'),
      role: 'Operator',
      isActive: true,
      buildingAccess: { create: { buildingId: building.id } },
    },
  });

  const cashierUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Cashier Fernando',
      email: 'cashier@motelcmb53.lk',
      passwordHash: await hashPw('Cashier@2025!'),
      role: 'Cashier',
      isActive: true,
      buildingAccess: { create: { buildingId: building.id } },
    },
  });

  const readonlyUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Readonly Staff',
      email: 'readonly@motelcmb53.lk',
      passwordHash: await hashPw('Readonly@2025!'),
      role: 'ReadOnly',
      isActive: true,
      buildingAccess: { create: { buildingId: building.id } },
    },
  });

  // Employees
  await prisma.employee.createMany({
    data: [
      {
        buildingId: building.id,
        userId: managerUser.id,
        fullName: 'Nimal Silva',
        mobile: '0771234567',
        nic: '198512345678',
        jobTitle: 'Building Manager',
        joiningDate: new Date('2020-01-15'),
        status: 'Active',
      },
      {
        buildingId: building.id,
        userId: operatorUser.id,
        fullName: 'Kamal Perera',
        mobile: '0759876543',
        nic: '199023456789',
        jobTitle: 'Receptionist',
        joiningDate: new Date('2022-03-01'),
        status: 'Active',
      },
      {
        buildingId: building.id,
        fullName: 'Sunil Fernando',
        mobile: '0714567890',
        nic: '198734567890',
        jobTitle: 'Housekeeper',
        joiningDate: new Date('2021-06-01'),
        status: 'Active',
      },
    ],
  });

  // Guests
  const today = new Date();
  const yesterday = subDays(today, 1);
  const tomorrow = addDays(today, 1);

  const guest1 = await prisma.guest.create({
    data: {
      fullName: 'Kamal Wickramasinghe',
      documentType: 'NIC',
      documentNumber: '198712345678',
      documentNumberMasked: '**********5678',
      mobile: '0771234567',
      whatsapp: '0771234567',
      nationality: 'Sri Lankan',
      address: '45 Galle Road, Colombo 3',
      createdById: operatorUser.id,
    },
  });

  const guest2 = await prisma.guest.create({
    data: {
      fullName: 'Priya Seneviratne',
      documentType: 'NIC',
      documentNumber: '199523456789',
      documentNumberMasked: '**********6789',
      mobile: '0759876543',
      nationality: 'Sri Lankan',
      createdById: operatorUser.id,
    },
  });

  const guest3 = await prisma.guest.create({
    data: {
      fullName: 'Roshan Mendis',
      documentType: 'Passport',
      documentNumber: 'N12345678',
      documentNumberMasked: '*****5678',
      mobile: '0714567890',
      nationality: 'Sri Lankan',
      createdById: adminUser.id,
    },
  });

  // Bookings
  // Booking 1: Currently checked in (Room 9, A/C, 2 nights)
  const booking1 = await prisma.booking.create({
    data: {
      reference: 'BKG-0001',
      buildingId: building.id,
      roomId: roomMap['9'].id,
      guestId: guest1.id,
      guestName: guest1.fullName,
      guestMobile: guest1.mobile,
      checkInDate: new Date(`${format(yesterday, 'yyyy-MM-dd')}T14:00:00`),
      checkOutDate: new Date(`${format(tomorrow, 'yyyy-MM-dd')}T12:00:00`),
      actualCheckIn: new Date(`${format(yesterday, 'yyyy-MM-dd')}T14:25:00`),
      nights: 2,
      adults: 2,
      children: 0,
      totalGuests: 2,
      isAc: true,
      baseNightlyRate: 8000,
      acSurchargePerNight: 2500,
      roomCharge: 21000,
      additionalCharges: 0,
      serviceCharge: 0,
      discount: 0,
      invoiceTotal: 21000,
      paidAmount: 5000,
      outstandingBalance: 16000,
      status: 'CheckedIn',
      createdById: operatorUser.id,
      checkedInById: operatorUser.id,
    },
  });

  await prisma.payment.create({
    data: {
      paymentReference: 'BKG-0001-PAY-01',
      bookingId: booking1.id,
      guestName: guest1.fullName,
      amount: 5000,
      purpose: 'Deposit',
      method: 'Cash',
      paymentDate: subDays(today, 3),
      collectedById: cashierUser.id,
    },
  });

  // Booking 2: Upcoming reservation (Room 5)
  const booking2 = await prisma.booking.create({
    data: {
      reference: 'BKG-0002',
      buildingId: building.id,
      roomId: roomMap['5'].id,
      guestId: guest2.id,
      guestName: guest2.fullName,
      guestMobile: guest2.mobile,
      checkInDate: new Date(`${format(tomorrow, 'yyyy-MM-dd')}T14:00:00`),
      checkOutDate: new Date(`${format(addDays(today, 3), 'yyyy-MM-dd')}T12:00:00`),
      nights: 2,
      adults: 1,
      children: 0,
      totalGuests: 1,
      isAc: false,
      baseNightlyRate: 5000,
      acSurchargePerNight: 0,
      roomCharge: 10000,
      additionalCharges: 0,
      serviceCharge: 0,
      discount: 0,
      invoiceTotal: 10000,
      paidAmount: 2000,
      outstandingBalance: 8000,
      status: 'Reserved',
      createdById: operatorUser.id,
    },
  });

  await prisma.payment.create({
    data: {
      paymentReference: 'BKG-0002-PAY-01',
      bookingId: booking2.id,
      guestName: guest2.fullName,
      amount: 2000,
      purpose: 'Deposit',
      method: 'Card',
      paymentDate: today,
      collectedById: cashierUser.id,
    },
  });

  // Booking 3: Completed/checked out (creates invoice)
  const booking3 = await prisma.booking.create({
    data: {
      reference: 'BKG-0003',
      buildingId: building.id,
      roomId: roomMap['1'].id,
      guestId: guest3.id,
      guestName: guest3.fullName,
      guestMobile: guest3.mobile,
      checkInDate: new Date(`${format(subDays(today, 3), 'yyyy-MM-dd')}T14:00:00`),
      checkOutDate: new Date(`${format(subDays(today, 1), 'yyyy-MM-dd')}T12:00:00`),
      actualCheckIn: new Date(`${format(subDays(today, 3), 'yyyy-MM-dd')}T14:10:00`),
      actualCheckOut: new Date(`${format(subDays(today, 1), 'yyyy-MM-dd')}T11:45:00`),
      nights: 2,
      adults: 4,
      children: 1,
      totalGuests: 5,
      isAc: true,
      baseNightlyRate: 8000,
      acSurchargePerNight: 2500,
      roomCharge: 21000,
      additionalCharges: 1500,
      serviceCharge: 0,
      discount: 500,
      invoiceTotal: 22000,
      paidAmount: 22000,
      outstandingBalance: 0,
      status: 'CheckedOut',
      createdById: adminUser.id,
      checkedInById: operatorUser.id,
      checkedOutById: managerUser.id,
    },
  });

  // Invoice for booking3
  const invoice = await prisma.invoice.create({
    data: {
      number: 'INV-00001',
      bookingId: booking3.id,
      status: 'Paid',
      subtotal: 22500,
      serviceCharge: 0,
      discount: 500,
      total: 22000,
      paidAmount: 22000,
      outstandingBalance: 0,
      createdById: managerUser.id,
      items: {
        create: [
          { description: 'Room 1 - 2 nights @ LKR 8,000', quantity: 2, unitPrice: 8000, total: 16000, sortOrder: 0 },
          { description: 'A/C Surcharge - 2 nights @ LKR 2,500', quantity: 2, unitPrice: 2500, total: 5000, sortOrder: 1 },
          { description: 'Room Service', quantity: 1, unitPrice: 1500, total: 1500, sortOrder: 2 },
          { description: 'Discount', quantity: 1, unitPrice: -500, total: -500, sortOrder: 3 },
        ],
      },
    },
  });

  await prisma.payment.createMany({
    data: [
      {
        paymentReference: 'BKG-0003-PAY-01',
        bookingId: booking3.id,
        invoiceId: invoice.id,
        guestName: guest3.fullName,
        amount: 10000,
        purpose: 'Deposit',
        method: 'Cash',
        paymentDate: subDays(today, 4),
        collectedById: cashierUser.id,
      },
      {
        paymentReference: 'BKG-0003-PAY-02',
        bookingId: booking3.id,
        invoiceId: invoice.id,
        guestName: guest3.fullName,
        amount: 12000,
        purpose: 'FinalPayment',
        method: 'Cash',
        paymentDate: subDays(today, 1),
        collectedById: cashierUser.id,
      },
    ],
  });

  // Room maintenance for Room 6
  await prisma.roomStatusHistory.create({
    data: {
      buildingId: building.id,
      roomId: roomMap['6'].id,
      fromStatus: 'Vacant',
      toStatus: 'Maintenance',
      reason: 'AC unit repair needed',
      startDate: subDays(today, 1),
      changedById: managerUser.id,
      notes: 'HVAC technician scheduled for tomorrow',
    },
  });

  // Settings
  await prisma.setting.createMany({
    data: [
      { organizationId: org.id, key: 'businessName', value: 'Motel CMB – 53' },
      { organizationId: org.id, key: 'address', value: 'No. 53, Panchikawatta Road, Maradana, Colombo 10, Sri Lanka' },
      { organizationId: org.id, key: 'phone1', value: '0112 323 728' },
      { organizationId: org.id, key: 'phone2', value: '077 771 5178' },
      { organizationId: org.id, key: 'phone3', value: '075 771 5178' },
      { organizationId: org.id, key: 'currency', value: 'LKR' },
      { organizationId: org.id, key: 'timezone', value: 'Asia/Colombo' },
      { organizationId: org.id, key: 'defaultCheckIn', value: '14:00' },
      { organizationId: org.id, key: 'defaultCheckOut', value: '12:00' },
      { organizationId: org.id, key: 'acSurcharge', value: '2500' },
      { organizationId: org.id, key: 'depositEnabled', value: 'true' },
      { organizationId: org.id, key: 'defaultDeposit', value: '2500' },
      { organizationId: org.id, key: 'serviceChargeEnabled', value: 'false' },
      { organizationId: org.id, key: 'serviceChargeType', value: 'percentage' },
      { organizationId: org.id, key: 'serviceChargeValue', value: '10' },
      { organizationId: org.id, key: 'discountEnabled', value: 'true' },
      { organizationId: org.id, key: 'discountApprovalRequired', value: 'false' },
      { organizationId: org.id, key: 'maxOperatorDiscount', value: '1000' },
    ],
  });

  // Sample audit logs
  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: org.id,
        buildingId: building.id,
        userId: adminUser.id,
        userRole: 'OwnerAdmin',
        action: 'LOGIN_SUCCESS',
        entityType: 'User',
        entityId: adminUser.id,
        createdAt: subDays(today, 1),
      },
      {
        organizationId: org.id,
        buildingId: building.id,
        userId: operatorUser.id,
        userRole: 'Operator',
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: booking1.id,
        newValue: { reference: 'BKG-0001' } as any,
        createdAt: subDays(today, 3),
      },
      {
        organizationId: org.id,
        buildingId: building.id,
        userId: operatorUser.id,
        userRole: 'Operator',
        action: 'BOOKING_CHECKED_IN',
        entityType: 'Booking',
        entityId: booking1.id,
        createdAt: yesterday,
      },
      {
        organizationId: org.id,
        buildingId: building.id,
        userId: managerUser.id,
        userRole: 'BuildingManager',
        action: 'BOOKING_CHECKED_OUT',
        entityType: 'Booking',
        entityId: booking3.id,
        createdAt: subDays(today, 1),
      },
    ],
  });

  console.log('✅ Seeding complete!');
  console.log('\n📋 Demo Credentials:');
  console.log('  Owner/Admin:      admin@motelcmb53.lk     / Admin@2025!');
  console.log('  Building Manager: manager@motelcmb53.lk   / Manager@2025!');
  console.log('  Operator:         operator@motelcmb53.lk  / Operator@2025!');
  console.log('  Cashier:          cashier@motelcmb53.lk   / Cashier@2025!');
  console.log('  Read-Only:        readonly@motelcmb53.lk  / Readonly@2025!');
  console.log('\n⚠️  Change all passwords before production deployment!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
