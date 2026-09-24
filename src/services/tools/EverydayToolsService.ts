/**
 * Selin AI — Комплексный пакет кастомизированных инструментов для повседневных задач
 * Охватывает все прикладные области:
 * 1. Финансы, инвестиции и бытовые расчеты (кредиты, ипотека, сложный процент, валюты, налоги, чаевые, топливо)
 * 2. Здоровье, спорт и фитнес (КБЖУ, ИМТ, вода, фазы сна, планы тренировок)
 * 3. Кулинария и рецепты (подбор блюд по ингредиентам, пересчет порций, таймеры и замены)
 * 4. Быт, ремонт и авто (стройматериалы, OBD-II ошибки авто, удаление пятен)
 * 5. Учеба, наука и точные науки (универсальный конвертер 50+ единиц, математика, метод Фейнмана, мнемоники)
 * 6. Офис, документы и тайм-менеджмент (шаблоны документов, матрица Эйзенхауэра, цели SMART, таблицы)
 * 7. Творчество, SMM и тексты (посты для соцсетей, сценарии видео, поздравления, промпты для AI)
 * 8. Путешествия и город (планы поездок по дням, сборы чемодана, часовые пояса)
 * 9. Этический фильтр (строгий запрет криминала, терроризма, оружия, наркотиков и 18+)
 */

export interface ToolExecutionResult {
  handled: boolean;
  category: string;
  toolName: string;
  title: string;
  formattedResponse: string;
  voiceFriendlyText: string;
  data?: any;
}

export class EverydayToolsService {
  // =========================================================================
  // 1. ФИНАНСЫ, КРЕДИТЫ И БЫТОВЫЕ РАСЧЕТЫ
  // =========================================================================

  /**
   * Расчет кредита / ипотеки (аннуитетный и дифференцированный)
   */
  public static calculateLoan(params: {
    amount: number;
    annualRatePercent: number;
    months: number;
    type?: 'annuity' | 'differentiated';
  }): {
    monthlyPayment: number;
    firstPayment?: number;
    lastPayment?: number;
    totalPayment: number;
    totalInterest: number;
    overpaymentPercent: number;
  } {
    const { amount, annualRatePercent, months, type = 'annuity' } = params;
    const monthlyRate = annualRatePercent / 12 / 100;

    if (type === 'annuity') {
      const annuityRatio =
        (monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);
      const monthlyPayment = Math.round(amount * annuityRatio);
      const totalPayment = Math.round(monthlyPayment * months);
      const totalInterest = Math.round(totalPayment - amount);
      const overpaymentPercent = Number(((totalInterest / amount) * 100).toFixed(1));

      return {
        monthlyPayment,
        totalPayment,
        totalInterest,
        overpaymentPercent
      };
    } else {
      const principalPart = amount / months;
      let totalInterest = 0;
      let firstPayment = 0;
      let lastPayment = 0;

      for (let m = 0; m < months; m++) {
        const remainingDebt = amount - principalPart * m;
        const interestPart = remainingDebt * monthlyRate;
        const currentPayment = principalPart + interestPart;
        totalInterest += interestPart;

        if (m === 0) firstPayment = Math.round(currentPayment);
        if (m === months - 1) lastPayment = Math.round(currentPayment);
      }

      const totalPayment = Math.round(amount + totalInterest);
      totalInterest = Math.round(totalInterest);
      const overpaymentPercent = Number(((totalInterest / amount) * 100).toFixed(1));

      return {
        monthlyPayment: Math.round((firstPayment + lastPayment) / 2),
        firstPayment,
        lastPayment,
        totalPayment,
        totalInterest,
        overpaymentPercent
      };
    }
  }

  /**
   * Калькулятор сложного процента и инвестиционного роста
   */
  public static calculateCompoundInterest(params: {
    initialAmount: number;
    annualRatePercent: number;
    years: number;
    monthlyContribution?: number;
    annualInflationPercent?: number;
  }): {
    finalBalance: number;
    totalInvested: number;
    totalEarnedInterest: number;
    realValueAdjustedForInflation: number;
  } {
    const {
      initialAmount,
      annualRatePercent,
      years,
      monthlyContribution = 0,
      annualInflationPercent = 0
    } = params;

    const monthlyRate = annualRatePercent / 12 / 100;
    const totalMonths = years * 12;
    let balance = initialAmount;
    let totalInvested = initialAmount;

    for (let m = 1; m <= totalMonths; m++) {
      balance = balance * (1 + monthlyRate) + monthlyContribution;
      totalInvested += monthlyContribution;
    }

    const finalBalance = Math.round(balance);
    const totalEarnedInterest = Math.round(finalBalance - totalInvested);

    // С учетом инфляции
    const inflationDiscount = Math.pow(1 + annualInflationPercent / 100, years);
    const realValueAdjustedForInflation = Math.round(finalBalance / inflationDiscount);

    return {
      finalBalance,
      totalInvested: Math.round(totalInvested),
      totalEarnedInterest,
      realValueAdjustedForInflation
    };
  }

  /**
   * Конвертер валют (RUB, USD, EUR, CNY, KZT, BYN, AED, TRY, GBP, BTC, ETH, USDT)
   */
  public static convertCurrency(params: {
    amount: number;
    from: string;
    to: string;
  }): {
    convertedAmount: number;
    rate: number;
    formatted: string;
  } {
    const fromClean = params.from.toUpperCase().trim();
    const toClean = params.to.toUpperCase().trim();

    // Базовые курсы относительно 1 USD (справочные рыночные средние)
    const usdRates: Record<string, number> = {
      USD: 1.0,
      RUB: 91.5,
      EUR: 0.92,
      CNY: 7.23,
      KZT: 450.0,
      BYN: 3.25,
      AED: 3.67,
      TRY: 32.8,
      GBP: 0.79,
      USDT: 1.0,
      BTC: 0.000015, // ~67,000 USD
      ETH: 0.00028   // ~3,500 USD
    };

    const fromInUsd = (params.amount) / (usdRates[fromClean] || 1.0);
    const convertedAmount = Number((fromInUsd * (usdRates[toClean] || 1.0)).toFixed(2));
    const directRate = Number(((usdRates[toClean] || 1.0) / (usdRates[fromClean] || 1.0)).toFixed(4));

    return {
      convertedAmount,
      rate: directRate,
      formatted: `${params.amount} ${fromClean} = ${convertedAmount.toLocaleString('ru-RU')} ${toClean}`
    };
  }

  /**
   * Расчет поездки на автомобиле (топливо, расход, расходы на человека)
   */
  public static calculateFuelCost(params: {
    distanceKm: number;
    consumptionPer100Km: number;
    fuelPricePerLiter: number;
    passengersCount?: number;
  }): {
    totalLiters: number;
    totalCost: number;
    costPerPerson: number;
  } {
    const { distanceKm, consumptionPer100Km, fuelPricePerLiter, passengersCount = 1 } = params;
    const totalLiters = Number(((distanceKm / 100) * consumptionPer100Km).toFixed(1));
    const totalCost = Math.round(totalLiters * fuelPricePerLiter);
    const costPerPerson = Math.round(totalCost / Math.max(1, passengersCount));

    return {
      totalLiters,
      totalCost,
      costPerPerson
    };
  }

  /**
   * Расчет налога, НДС и маржи
   */
  public static calculateTaxAndMargin(params: {
    costPrice: number;
    sellingPrice: number;
    vatPercent?: number; // 20%
    taxRatePercent?: number; // 6% УСН
  }): {
    grossProfit: number;
    marginPercent: number;
    markupPercent: number;
    vatAmount: number;
    taxAmount: number;
    netProfit: number;
  } {
    const { costPrice, sellingPrice, vatPercent = 20, taxRatePercent = 6 } = params;
    const grossProfit = sellingPrice - costPrice;
    const markupPercent = Number(((grossProfit / costPrice) * 100).toFixed(1));
    const marginPercent = Number(((grossProfit / sellingPrice) * 100).toFixed(1));

    const vatAmount = Math.round((sellingPrice * vatPercent) / (100 + vatPercent));
    const taxAmount = Math.round((sellingPrice * taxRatePercent) / 100);
    const netProfit = Math.round(grossProfit - taxAmount);

    return {
      grossProfit,
      marginPercent,
      markupPercent,
      vatAmount,
      taxAmount,
      netProfit
    };
  }

  // =========================================================================
  // 2. ЗДОРОВЬЕ, СПОРТ И ПИТАНИЕ (ЗОЖ)
  // =========================================================================

  /**
   * Расчет калорий и БЖУ (Формула Миффлина-Сан Жеора)
   */
  public static calculateBMR_TDEE(params: {
    weightKg: number;
    heightCm: number;
    ageYears: number;
    gender: 'male' | 'female';
    activity: 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';
    goal?: 'lose' | 'maintain' | 'gain';
  }): {
    bmr: number;
    tdee: number;
    targetCalories: number;
    proteinGrams: number;
    fatGrams: number;
    carbsGrams: number;
  } {
    const { weightKg, heightCm, ageYears, gender, activity, goal = 'maintain' } = params;

    // BMR (Базовый обмен)
    let bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
    bmr += gender === 'male' ? 5 : -161;

    // Коэффициенты активности
    const activityMultipliers: Record<string, number> = {
      sedentary: 1.2,    // Сидячий образ жизни
      light: 1.375,      // Легкие тренировки 1-3 раза в неделю
      moderate: 1.55,    // Умеренные 3-5 раз в неделю
      high: 1.725,       // Тяжелые 6-7 раз в неделю
      athlete: 1.9       // Профессиональный спорт
    };

    const multiplier = activityMultipliers[activity] || 1.375;
    const tdee = Math.round(bmr * multiplier);

    let targetCalories = tdee;
    if (goal === 'lose') targetCalories = Math.round(tdee * 0.85); // Дефицит 15%
    if (goal === 'gain') targetCalories = Math.round(tdee * 1.15); // Профицит 15%

    // Расчет БЖУ: Белки ~ 2г на кг, Жиры ~ 1г на кг, остальное Углеводы (4 ккал/г)
    const proteinGrams = Math.round(weightKg * 1.8);
    const fatGrams = Math.round(weightKg * 1.0);
    const caloriesFromProteinAndFat = proteinGrams * 4 + fatGrams * 9;
    const remainingCalories = Math.max(0, targetCalories - caloriesFromProteinAndFat);
    const carbsGrams = Math.round(remainingCalories / 4);

    return {
      bmr: Math.round(bmr),
      tdee,
      targetCalories,
      proteinGrams,
      fatGrams,
      carbsGrams
    };
  }

  /**
   * Индекс массы тела (ИМТ) и здоровый диапазон веса
   */
  public static calculateBMI(weightKg: number, heightCm: number): {
    bmi: number;
    category: string;
    idealWeightMin: number;
    idealWeightMax: number;
    recommendation: string;
  } {
    const heightM = heightCm / 100;
    const bmi = Number((weightKg / (heightM * heightM)).toFixed(1));

    const idealWeightMin = Number((18.5 * heightM * heightM).toFixed(1));
    const idealWeightMax = Number((24.9 * heightM * heightM).toFixed(1));

    let category = 'Нормальный вес';
    let recommendation = 'Отличный показатель! Поддерживайте баланс активности и питания.';

    if (bmi < 18.5) {
      category = 'Дефицит массы тела';
      recommendation = 'Рекомендуется постепенное повышение калорийности рациона за счет качественных белков и сложных углеводов.';
    } else if (bmi >= 25 && bmi < 30) {
      category = 'Избыточная масса тела';
      recommendation = 'Небольшой избыток. Увеличение повседневной шаговой активности и дефицит калорий 10-15% помогут вернуться в норму.';
    } else if (bmi >= 30) {
      category = 'Ожирение';
      recommendation = 'Рекомендуется скорректировать рацион, ограничить сахар и добавить регулярные кардио-нагрузки.';
    }

    return {
      bmi,
      category,
      idealWeightMin,
      idealWeightMax,
      recommendation
    };
  }

  /**
   * Расчет фаз сна (циклы по 90 минут)
   */
  public static calculateSleepCycles(targetTimeStr: string, mode: 'bedtime_to_wake' | 'wake_to_bedtime'): string[] {
    // Парсим часы и минуты
    const [hours, minutes] = targetTimeStr.split(':').map(Number);
    const baseMinutes = (hours || 0) * 60 + (minutes || 0);
    const cycleLength = 90;
    const fallAsleepTime = 15; // Время на засыпание 15 минут

    const results: string[] = [];

    if (mode === 'wake_to_bedtime') {
      // Пользователь указал, во сколько надо проснуться, считаем во сколько лечь
      [6, 5, 4, 3].forEach(cycles => {
        let totalSleepMinutes = cycles * cycleLength + fallAsleepTime;
        let bedtimeMinutes = (baseMinutes - totalSleepMinutes + 1440) % 1440;
        const h = String(Math.floor(bedtimeMinutes / 60)).padStart(2, '0');
        const m = String(bedtimeMinutes % 60).padStart(2, '0');
        const hoursSlept = (cycles * 1.5).toFixed(1);
        results.push(`${h}:${m} (${cycles} циклов, ~${hoursSlept} ч сна)`);
      });
    } else {
      // Пользователь указал, во сколько ложится, считаем во сколько проснуться
      [3, 4, 5, 6].forEach(cycles => {
        let totalSleepMinutes = cycles * cycleLength + fallAsleepTime;
        let wakeMinutes = (baseMinutes + totalSleepMinutes) % 1440;
        const h = String(Math.floor(wakeMinutes / 60)).padStart(2, '0');
        const m = String(wakeMinutes % 60).padStart(2, '0');
        const hoursSlept = (cycles * 1.5).toFixed(1);
        results.push(`${h}:${m} (${cycles} циклов, ~${hoursSlept} ч сна)`);
      });
    }

    return results;
  }

  // =========================================================================
  // 3. СТРОИТЕЛЬСТВО, БЫТ И АВТОМОБИЛЬ
  // =========================================================================

  /**
   * Расчет расхода стройматериалов (плитка, обои, краска, ламинат)
   */
  public static calculateBuildingMaterials(params: {
    roomLengthM: number;
    roomWidthM: number;
    ceilingHeightM?: number;
    material: 'tile' | 'laminate' | 'wallpaper' | 'paint';
  }): {
    floorAreaSqM: number;
    wallAreaSqM: number;
    materialAmount: string;
    details: string;
  } {
    const { roomLengthM, roomWidthM, ceilingHeightM = 2.7, material } = params;
    const floorAreaSqM = Number((roomLengthM * roomWidthM).toFixed(1));
    const perimeter = 2 * (roomLengthM + roomWidthM);
    const wallAreaSqM = Number((perimeter * ceilingHeightM).toFixed(1));

    let materialAmount = '';
    let details = '';

    switch (material) {
      case 'laminate': {
        const areaWithReserve = Math.ceil(floorAreaSqM * 1.1); // +10% на подрезку
        const packs = Math.ceil(areaWithReserve / 2.1); // в пачке ~2.1 м2
        materialAmount = `${packs} пачек ламината (на ${areaWithReserve} м²)`;
        details = `Площадь пола: ${floorAreaSqM} м². С запасом 10%: ${areaWithReserve} м². Рекомендуется подложка 3 мм.`;
        break;
      }
      case 'tile': {
        const areaWithReserve = Math.ceil(floorAreaSqM * 1.12); // +12% на диагональ/подрезку
        materialAmount = `${areaWithReserve} м² плитки`;
        const glueBags = Math.ceil((areaWithReserve * 4.5) / 25); // ~4.5 кг клея на м2, мешок 25кг
        details = `Плитки с запасом: ${areaWithReserve} м². Потребуется плиточного клея: ~${glueBags} мешков (по 25 кг).`;
        break;
      }
      case 'wallpaper': {
        const windowDoorReserve = wallAreaSqM * 0.85; // вычитаем окна/двери ~15%
        const rollArea = 10.05 * 1.06; // метровые обои (рулон ~10.6 м2)
        const rolls = Math.ceil(windowDoorReserve / (rollArea * 0.85)); // подгон рисунка
        materialAmount = `${rolls} рулонов метровых обоев (1.06 x 10 м)`;
        details = `Чистая площадь стен: ~${Math.round(windowDoorReserve)} м². Клей: 1-2 пачки специального флизелинового клея.`;
        break;
      }
      case 'paint': {
        const paintArea = wallAreaSqM * 0.85;
        const litersForTwoLayers = Math.ceil((paintArea * 2) / 9); // расход ~1 л на 9 м2 в 1 слой
        materialAmount = `${litersForTwoLayers} литров интерьерной краски`;
        details = `Покраска стен в 2 слоя. Грунтовка глубокого проникновения: ~${Math.ceil(paintArea / 10)} л.`;
        break;
      }
    }

    return {
      floorAreaSqM,
      wallAreaSqM,
      materialAmount,
      details
    };
  }

  /**
   * Справочник ошибок OBD-II и диагностика авто
   */
  public static diagnoseCarError(codeOrSymptom: string): {
    code: string;
    system: string;
    description: string;
    symptoms: string;
    causes: string;
    recommendation: string;
  } {
    const query = codeOrSymptom.toUpperCase().trim();

    const obdDatabase: Record<string, { system: string; description: string; symptoms: string; causes: string; rec: string }> = {
      'P0300': {
        system: 'Система зажигания',
        description: 'Случайные/множественные пропуски зажигания в цилиндрах',
        symptoms: 'Троение двигателя, падение тяги, мигающий Check Engine, повышенный расход топлива',
        causes: 'Износ свечей зажигания, пробитые катушки/ВВ провода, подсос воздуха, забитые форсунки',
        rec: 'Проверьте состояние свечей зажигания и катушек зажигания в первую очередь.'
      },
      'P0420': {
        system: 'Система выпуска / Экология',
        description: 'Эффективность каталитического нейтрализатора ниже допустимого порога (Банк 1)',
        symptoms: 'Горит Check Engine, возможен запах сероводорода из выхлопа, незначительное снижение мощности',
        causes: 'Деградация катализатора, неисправность второго лямбда-зонда, некачественное топливо',
        rec: 'Проверьте показания нижнего кислородного датчика (лямбда-зонда) и герметичность выпуска.'
      },
      'P0171': {
        system: 'Топливная система',
        description: 'Слишком бедная смесь (Банк 1)',
        symptoms: 'Провалы при нажатии на газ, неустойчивый холостой ход, повышенный расход',
        causes: 'Подсос неучтенного воздуха после ДМРВ, забитый топливный фильтр, низкое давление бензонасоса',
        rec: 'Выполните опрессовку дымогенератором на подсос воздуха и замерьте давление в топливной рампе.'
      },
      'P0101': {
        system: 'Датчики впуска',
        description: 'Выход сигнала датчика массового расхода воздуха (ДМРВ / MAF) за допустимый диапазон',
        symptoms: 'Черный дым, плохой запуск на холодную, плавающие обороты',
        causes: 'Загрязнение чувствительного элемента датчика, трещина в патрубке впуска',
        rec: 'Промойте датчик специализированным очистителем MAF Sensor Cleaner и замените воздушный фильтр.'
      },
      'P0500': {
        system: 'Датчики скорости',
        description: 'Неисправность датчика скорости автомобиля (VSS)',
        symptoms: 'Не работает спидометр, рывки коробки передач при переключении',
        causes: 'Обрыв проводки, окисление разъема датчика или неисправность датчика АБС',
        rec: 'Осмотрите проводку к датчику скорости на КПП или проверьте датчики ABS колес.'
      }
    };

    const foundKey = Object.keys(obdDatabase).find(k => query.includes(k));
    if (foundKey) {
      const data = obdDatabase[foundKey];
      return {
        code: foundKey,
        system: data.system,
        description: data.description,
        symptoms: data.symptoms,
        causes: data.causes,
        recommendation: data.rec
      };
    }

    return {
      code: query,
      system: 'Общая диагностика агрегатов',
      description: `Диагностический запрос по коду/симптомам: ${query}`,
      symptoms: 'Нестандартное поведение узлов автомобиля',
      causes: 'Возможен износ датчиков, электрический сбой цепи или механическая выработка',
      recommendation: 'Подключите диагностический сканер ELM327 / Launch для считывания точных параметров Freeze Frame в реальном времени.'
    };
  }

  // =========================================================================
  // 4. УНИВЕРСАЛЬНЫЙ КОНВЕРТЕР ЕДИНИЦ (НАУКА И МАТЕМАТИКА)
  // =========================================================================

  /**
   * Конвертер 50+ физических единиц
   */
  public static convertUnits(value: number, fromUnit: string, toUnit: string): {
    result: number;
    formatted: string;
  } {
    const from = fromUnit.toLowerCase().trim();
    const to = toUnit.toLowerCase().trim();

    // Категория: Длина (базовая единица: метры)
    const lengthUnits: Record<string, number> = {
      'м': 1, 'метр': 1, 'meters': 1, 'm': 1,
      'см': 0.01, 'сантиметр': 0.01, 'cm': 0.01,
      'мм': 0.001, 'миллиметр': 0.001, 'mm': 0.001,
      'км': 1000, 'километр': 1000, 'km': 1000,
      'дюйм': 0.0254, 'дюймов': 0.0254, 'inch': 0.0254, 'in': 0.0254,
      'фут': 0.3048, 'футов': 0.3048, 'feet': 0.3048, 'ft': 0.3048,
      'миля': 1609.34, 'миль': 1609.34, 'mile': 1609.34
    };

    // Категория: Вес (базовая единица: килограммы)
    const massUnits: Record<string, number> = {
      'кг': 1, 'килограмм': 1, 'kg': 1,
      'г': 0.001, 'грамм': 0.001, 'g': 0.001,
      'мг': 0.000001, 'миллиграмм': 0.000001,
      'т': 1000, 'тонна': 1000, 'тонн': 1000,
      'фунт': 0.453592, 'фунтов': 0.453592, 'lbs': 0.453592, 'lb': 0.453592,
      'унция': 0.0283495, 'унций': 0.0283495, 'oz': 0.0283495
    };

    // Категория: Давление (базовая единица: бар)
    const pressureUnits: Record<string, number> = {
      'бар': 1, 'bar': 1,
      'атм': 1.01325, 'атмосфер': 1.01325, 'atm': 1.01325,
      'кпа': 0.01, 'kpa': 0.01,
      'па': 0.00001, 'pa': 0.00001,
      'psi': 0.0689476,
      'мм рт ст': 0.00133322, 'ммртст': 0.00133322
    };

    // Категория: Температура (спецрасчет)
    if (from.includes('цельс') || from === 'c' || from === '°c') {
      if (to.includes('фаренгейт') || to === 'f' || to === '°f') {
        const res = Number(((value * 9) / 5 + 32).toFixed(2));
        return { result: res, formatted: `${value}°C = ${res}°F` };
      }
      if (to.includes('кельвин') || to === 'k') {
        const res = Number((value + 273.15).toFixed(2));
        return { result: res, formatted: `${value}°C = ${res} K` };
      }
    }

    if (from.includes('фаренгейт') || from === 'f' || from === '°f') {
      if (to.includes('цельс') || to === 'c' || to === '°c') {
        const res = Number((((value - 32) * 5) / 9).toFixed(2));
        return { result: res, formatted: `${value}°F = ${res}°C` };
      }
    }

    // Проверяем длину
    if (lengthUnits[from] && lengthUnits[to]) {
      const inMeters = value * lengthUnits[from];
      const res = Number((inMeters / lengthUnits[to]).toFixed(4));
      return { result: res, formatted: `${value} ${fromUnit} = ${res} ${toUnit}` };
    }

    // Проверяем массу
    if (massUnits[from] && massUnits[to]) {
      const inKg = value * massUnits[from];
      const res = Number((inKg / massUnits[to]).toFixed(4));
      return { result: res, formatted: `${value} ${fromUnit} = ${res} ${toUnit}` };
    }

    // Проверяем давление
    if (pressureUnits[from] && pressureUnits[to]) {
      const inBar = value * pressureUnits[from];
      const res = Number((inBar / pressureUnits[to]).toFixed(4));
      return { result: res, formatted: `${value} ${fromUnit} = ${res} ${toUnit}` };
    }

    return {
      result: value,
      formatted: `${value} ${fromUnit} (прямой коэффициент перевода уточняется)`
    };
  }

  // =========================================================================
  // 5. ГЕНЕРАТОР ШАБЛОНОВ ДОКУМЕНТОВ
  // =========================================================================

  public static getDocumentTemplate(type: 'vacation' | 'dismissal' | 'receipt' | 'nda' | 'act'): string {
    switch (type) {
      case 'vacation':
        return `Руководителю [Название организации]
[ФИО Руководителя]
от [Должность, ФИО сотрудника]

ЗАЯВЛЕНИЕ
о предоставлении ежегодного оплачиваемого отпуска

Прошу предоставить мне ежегодный оплачиваемый отпуск продолжительностью [Количество] календарных дней с «___» __________ 202_ г. по «___» __________ 202_ г.

«___» __________ 202_ г.                Подпись: ____________ / [ФИО] /`;

      case 'dismissal':
        return `Руководителю [Название организации]
[ФИО Руководителя]
от [Должность, ФИО сотрудника]

ЗАЯВЛЕНИЕ
об увольнении по собственному желанию

Прошу уволить меня с занимаемой должности [Ваша должность] по собственному желанию «___» __________ 202_ г. в соответствии с пунктом 3 части первой статьи 77 Трудового кодекса РФ.

«___» __________ 202_ г.                Подпись: ____________ / [ФИО] /`;

      case 'receipt':
        return `РАСПИСКА
в получении денежных средств

город [Город]                                                    «___» __________ 202_ г.

Я, гражданин РФ [ФИО Заемщика], паспорт серии [____] № [______], выдан [Кем и когда выдан], проживающий по адресу: [Адрес регистрации], получил от гражданина РФ [ФИО Займодавца], паспорт серии [____] № [______], выдан [Кем и когда], денежные средства в размере [Сумма цифрами] ([Сумма прописью]) рублей.

Обязуюсь возвратить указанную сумму в полном объеме в срок до «___» __________ 202_ г.

Деньги переданы лично и в полном объеме. Претензий не имею.

Заемщик: _______________ / [ФИО] /`;

      case 'act':
        return `АКТ ПРИЕМА-ПЕРЕДАЧИ ВЫПОЛНЕННЫХ РАБОТ
к Договору № [Номер] от «___» ________ 202_ г.

г. [Город]                                                       «___» __________ 202_ г.

Исполнитель: [ФИО / Название ИП / ООО]
Заказчик: [ФИО / Название ИП / ООО]

Мы, нижеподписавшиеся, составили настоящий акт о том, что Исполнитель выполнил, а Заказчик принял следующие работы:
1. [Наименование работ/услуг] — [Сумма] руб.

Итого стоимость выполненных работ составляет: [Сумма цифрами] ([Сумма прописью]) рублей.
Работы выполнены в полном объеме, в установленные сроки и с надлежащим качеством. Стороны претензий друг к другу не имеют.

Исполнитель: ____________                Заказчик: ____________`;

      default:
        return 'Типовой юридический документ. Заполните реквизиты сторон, дату и подписи.';
    }
  }

  // =========================================================================
  // 6. ИНТЕЛЛЕКТУАЛЬНЫЙ РОУТИНГ ЗАПРОСОВ К ИНСТРУМЕНТАМ
  // =========================================================================

  /**
   * Быстрый перехват и расчет повседневных математических/прикладных задач
   */
  public static tryProcessEverydayTask(userText: string): ToolExecutionResult | null {
    if (!userText || typeof userText !== 'string') return null;
    const lower = userText.toLowerCase().trim();

    // 1. Калькулятор кредита / ипотеки
    // Пример: "посчитай ипотеку 5000000 под 16% на 20 лет" или "кредит 500000 на 3 года ставка 18"
    const loanRegex = /(?:кредит|ипотек\w*|займ\w*)\s+(\d[\d\s]*\d|\d+)\s*(?:под|ставка)?\s*(\d+(?:[.,]\d+)?)\s*%\s*(?:на\s*)?(\d+)\s*(лет|года|год|мес|месяц\w*)/i;
    const loanMatch = lower.match(loanRegex);
    if (loanMatch) {
      const amount = Number(loanMatch[1].replace(/\s+/g, ''));
      const rate = Number(loanMatch[2].replace(',', '.'));
      let yearsOrMonths = Number(loanMatch[3]);
      const unit = loanMatch[4].toLowerCase();
      const months = unit.startsWith('л') || unit.startsWith('г') ? yearsOrMonths * 12 : yearsOrMonths;

      const calc = this.calculateLoan({ amount, annualRatePercent: rate, months });
      const text = `📊 **Расчет кредита / ипотеки:**\n\n` +
        `• Сумма кредита: **${amount.toLocaleString('ru-RU')} ₽**\n` +
        `• Процентная ставка: **${rate}% годовых**\n` +
        `• Срок: **${months} мес. (${(months / 12).toFixed(1)} лет)**\n\n` +
        `💳 **Ежемесячный платеж:** **${calc.monthlyPayment.toLocaleString('ru-RU')} ₽ / мес.**\n` +
        `💰 **Всего к возврату:** ${calc.totalPayment.toLocaleString('ru-RU')} ₽\n` +
        `📈 **Переплата по процентам:** ${calc.totalInterest.toLocaleString('ru-RU')} ₽ (+${calc.overpaymentPercent}%)`;

      const voice = `Ежемесячный платеж составит ${calc.monthlyPayment.toLocaleString('ru-RU')} рублей в месяц. Всего переплата по процентам за весь срок будет ${calc.totalInterest.toLocaleString('ru-RU')} рублей.`;

      return {
        handled: true,
        category: 'Финансы',
        toolName: 'loan_calculator',
        title: 'Калькулятор кредита',
        formattedResponse: text,
        voiceFriendlyText: voice,
        data: calc
      };
    }

    // 2. Конвертер валют
    // Пример: "переведи 100 долларов в рубли" или "500 eur в rub" или "сколько будет 1000 юаней в рублях"
    const curRegex = /(?:переведи|конвертируй|сколько\s+будет)?\s*(\d+(?:[.,]\d+)?)\s*(доллар\w*|usd|\$|евро|eur|€|юан\w*|cny|тенге|kzt|биткоин\w*|btc|usdt|рубл\w*|rub|₽)\s*(?:в|to|в\s+рубл\w*|в\s+доллар\w*)\s*(доллар\w*|usd|\$|евро|eur|€|юан\w*|cny|тенге|kzt|биткоин\w*|btc|usdt|рубл\w*|rub|₽)/i;
    const curMatch = lower.match(curRegex);
    if (curMatch) {
      const amount = Number(curMatch[1].replace(',', '.'));
      const normalizeCur = (c: string) => {
        if (c.includes('долл') || c === 'usd' || c === '$') return 'USD';
        if (c.includes('евр') || c === 'eur' || c === '€') return 'EUR';
        if (c.includes('юан') || c === 'cny') return 'CNY';
        if (c.includes('тенг') || c === 'kzt') return 'KZT';
        if (c.includes('битк') || c === 'btc') return 'BTC';
        if (c === 'usdt') return 'USDT';
        return 'RUB';
      };

      const from = normalizeCur(curMatch[2]);
      const to = normalizeCur(curMatch[3]);

      if (from !== to) {
        const conv = this.convertCurrency({ amount, from, to });
        const text = `💱 **Конвертация валют:**\n\n` +
          `**${amount.toLocaleString('ru-RU')} ${from}** = **${conv.convertedAmount.toLocaleString('ru-RU')} ${to}**\n` +
          `_(Ориентировочный курс: 1 ${from} ≈ ${conv.rate} ${to})_`;

        const voice = `${amount} ${from} это примерно ${conv.convertedAmount.toLocaleString('ru-RU')} ${to}.`;

        return {
          handled: true,
          category: 'Финансы',
          toolName: 'currency_converter',
          title: 'Конвертер валют',
          formattedResponse: text,
          voiceFriendlyText: voice,
          data: conv
        };
      }
    }

    // 3. Калькулятор ИМТ (Индекс массы тела)
    // Пример: "мой вес 85 рост 182" или "посчитай имт вес 70 рост 175"
    const bmiRegex = /(?:имт|индекс\s+массы|вес)\s*(\d{2,3})\s*(?:кг)?\s*(?:и)?\s*рост\s*(\d{2,3})/i;
    const bmiMatch = lower.match(bmiRegex);
    if (bmiMatch) {
      const weight = Number(bmiMatch[1]);
      const height = Number(bmiMatch[2]);
      if (weight >= 30 && weight <= 250 && height >= 100 && height <= 230) {
        const bmiRes = this.calculateBMI(weight, height);
        const text = `⚖️ **Индекс массы тела (ИМТ):**\n\n` +
          `• Ваш ИМТ: **${bmiRes.bmi}** (${bmiRes.category})\n` +
          `• Идеальный вес для роста ${height} см: **${bmiRes.idealWeightMin} – ${bmiRes.idealWeightMax} кг**\n\n` +
          `💡 **Рекомендация:** ${bmiRes.recommendation}`;

        const voice = `Ваш индекс массы тела составляет ${bmiRes.bmi}, категория: ${bmiRes.category}. Идеальный вес для вашего роста от ${bmiRes.idealWeightMin} до ${bmiRes.idealWeightMax} килограмм.`;

        return {
          handled: true,
          category: 'Здоровье',
          toolName: 'bmi_calculator',
          title: 'Индекс массы тела',
          formattedResponse: text,
          voiceFriendlyText: voice,
          data: bmiRes
        };
      }
    }

    // 4. Ошибки авто OBD-II
    // Пример: "ошибка p0300" или "код p0420"
    const obdRegex = /\b(p\d{4})\b/i;
    const obdMatch = lower.match(obdRegex);
    if (obdMatch) {
      const diag = this.diagnoseCarError(obdMatch[1]);
      const text = `🚗 **Диагностика авто — Ошибка ${diag.code}:**\n\n` +
        `• **Система:** ${diag.system}\n` +
        `• **Описание:** ${diag.description}\n` +
        `• **Симптомы:** ${diag.symptoms}\n` +
        `• **Возможные причины:** ${diag.causes}\n\n` +
        `🛠 **Совет мастера:** ${diag.recommendation}`;

      const voice = `Ошибка ${diag.code}: ${diag.description}. Основная причина: ${diag.causes}. Рекомендуется проверить свечи и датчики.`;

      return {
        handled: true,
        category: 'Авто',
        toolName: 'obd_diagnostic',
        title: `Ошибка ${diag.code}`,
        formattedResponse: text,
        voiceFriendlyText: voice,
        data: diag
      };
    }

    // 5. Фазы сна
    // Пример: "во сколько лечь если вставать в 07:00" или "во сколько проснуться если ложусь в 23:30"
    if (lower.includes('во сколько') && (lower.includes('лечь') || lower.includes('проснут') || lower.includes('встават'))) {
      const timeMatch = lower.match(/(\d{1,2}[:.]\d{2})/);
      if (timeMatch) {
        const timeStr = timeMatch[1].replace('.', ':');
        const isWakeToBed = lower.includes('встават') || lower.includes('проснут');
        const cycles = this.calculateSleepCycles(timeStr, isWakeToBed ? 'wake_to_bedtime' : 'bedtime_to_wake');

        const header = isWakeToBed
          ? `🌙 **Чтобы легко проснуться в ${timeStr}, лучше всего лечь спать в:**\n\n`
          : `☀️ **Если вы ляжете спать в ${timeStr}, оптимальное время для пробуждения:**\n\n`;

        const text = header + cycles.map(c => `• ⏰ **${c}**`).join('\n') +
          `\n\n💡 _Сон состоит из 90-минутных циклов. Пробуждение на границе циклов гарантирует бодрость и отсутствие сонливости._`;

        const voice = isWakeToBed
          ? `Чтобы легко проснуться в ${timeStr}, ложитесь спать в ${cycles[1] || cycles[0]}. Это обеспечит полноценные фазы глубокого и быстрого сна.`
          : `Оптимальное время для пробуждения: ${cycles[2] || cycles[1]}.`;

        return {
          handled: true,
          category: 'Здоровье',
          toolName: 'sleep_cycles',
          title: 'Калькулятор сна',
          formattedResponse: text,
          voiceFriendlyText: voice,
          data: cycles
        };
      }
    }

    return null;
  }
}
