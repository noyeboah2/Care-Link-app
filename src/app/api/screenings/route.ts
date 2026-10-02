import { NextResponse } from 'next/server';

type ScreeningBody = {
  babyName?: unknown;
  ageMonths?: unknown;
  jaundicePresent?: unknown;
  dactylitisPresent?: unknown;
  familyScdHistory?: unknown;
  regionalHospital?: unknown;
};

const isTrue = (value: unknown): value is true => value === true;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScreeningBody;

    if (typeof body.babyName !== 'string' || !body.babyName.trim()) {
      return NextResponse.json(
        { success: false, error: 'babyName is required' },
        { status: 400 },
      );
    }

    // Preserve the application's existing screening rules.
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (isTrue(body.jaundicePresent) && isTrue(body.dactylitisPresent)) {
      riskLevel = 'HIGH';
    } else if (
      isTrue(body.jaundicePresent) ||
      isTrue(body.dactylitisPresent) ||
      isTrue(body.familyScdHistory)
    ) {
      riskLevel = 'MEDIUM';
    }

    return NextResponse.json({
      success: true,
      data: {
        babyName: body.babyName.trim(),
        ageMonths: typeof body.ageMonths === 'number' ? body.ageMonths : null,
        riskLevel,
        recommendedAction:
          riskLevel === 'HIGH'
            ? 'Immediate HPLC / Electrophoresis test required at regional facility.'
            : 'Routine neonatal follow-up scheduled.',
        assignedHospital:
          typeof body.regionalHospital === 'string' && body.regionalHospital.trim()
            ? body.regionalHospital.trim()
            : 'Korle Bu Teaching Hospital',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid screening request' },
      { status: 400 },
    );
  }
}
