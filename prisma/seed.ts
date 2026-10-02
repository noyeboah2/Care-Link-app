import { PrismaClient, Role, RiskLevel, FollowUpStatus, Severity } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Child", "Hospital", "Screening", "CareInstruction", "FollowUp", "CrisisAlert" CASCADE;`);

  // Hospitals
  const korleBu = await prisma.hospital.create({
    data: {
      name: 'Korle-Bu Teaching Hospital (SCD Centre)',
      region: 'Greater Accra',
      city: 'Accra',
      diagnosticCapabilities: ['HPLC', 'Isoelectric Focusing', 'Sickling Test', 'Blood Transfusion'],
      hasSCDClinic: true,
      contactPhone: '+233302665401',
      address: 'Guggisberg Ave, Korle Gonno, Accra',
    },
  });

  const komfoAnokye = await prisma.hospital.create({
    data: {
      name: 'Komfo Anokye Teaching Hospital (SCD Clinic)',
      region: 'Ashanti',
      city: 'Kumasi',
      diagnosticCapabilities: ['HPLC', 'Gel Electrophoresis', 'Hydroxyurea Therapy', 'Pediatric ICU'],
      hasSCDClinic: true,
      contactPhone: '+233322022301',
      address: 'Bantama High St, Kumasi',
    },
  });

  const tamaleRegional = await prisma.hospital.create({
    data: {
      name: 'Tamale Teaching Hospital',
      region: 'Northern',
      city: 'Tamale',
      diagnosticCapabilities: ['Sickling Test', 'Hemoglobin Electrophoresis'],
      hasSCDClinic: true,
      contactPhone: '+233372022458',
      address: 'Hospital Road, Tamale',
    },
  });

  // Users
  const worker1 = await prisma.user.create({
    data: {
      email: 'kwame.mensah@ghanahealth.gov.gh',
      passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjOL.8844883399001122334455',
      name: 'Kwame Mensah',
      role: Role.HEALTH_WORKER,
      region: 'Greater Accra',
      isOnline: true,
    },
  });

  const supervisor1 = await prisma.user.create({
    data: {
      email: 'dr.akua.owusu@ghanahealth.gov.gh',
      passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjOL.8844883399001122334455',
      name: 'Dr. Akua Owusu',
      role: Role.SUPERVISOR,
      region: 'Greater Accra',
      isOnline: true,
    },
  });

  // Children
  const child1 = await prisma.child.create({
    data: {
      fullName: 'Kofi Addo',
      age: 4,
      gender: 'Male',
      caregiverPhone: '+233244123456',
      region: 'Greater Accra',
      assignedWorkerId: worker1.id,
    },
  });

  const child2 = await prisma.child.create({
    data: {
      fullName: 'Ama Serwaa',
      age: 2,
      gender: 'Female',
      caregiverPhone: '+233555987654',
      region: 'Greater Accra',
      assignedWorkerId: worker1.id,
    },
  });

  // Screenings
  const screening1 = await prisma.screening.create({
    data: {
      childId: child1.id,
      workerId: worker1.id,
      answers: { jaundice: true, severePain: true, dactylitis: true, swollenJoints: true },
      riskLevel: RiskLevel.HIGH_RISK,
      referralHospitalId: korleBu.id,
    },
  });

  await prisma.careInstruction.create({
    data: {
      screeningId: screening1.id,
      textEnglish: 'Immediate referral required. Ensure child stays hydrated and avoid extreme temperatures.',
      textTwi: 'Monkɔ ayaresabea ntɛm pa ara. Mmma abofra no nso nya nsufu pii na mmoa no mmra hyew anaa awɔ mu.',
      audioUrl: '/audio/twi_high_risk_instruction.mp3',
    },
  });

  await prisma.followUp.create({
    data: {
      childId: child1.id,
      workerId: worker1.id,
      scheduledDate: new Date('2026-09-18T09:00:00Z'),
      status: FollowUpStatus.PENDING,
      notes: 'Verify Korle-Bu attendance and pain management.',
    },
  });

  await prisma.crisisAlert.create({
    data: {
      childId: child1.id,
      severity: Severity.CRITICAL,
      message: 'Acute Vaso-Occlusive Pain Crisis reported by caregiver via SMS.',
      acknowledged: false,
    },
  });

  console.log('Database successfully seeded with Ghana SCD data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
