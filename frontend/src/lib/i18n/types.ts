export type Locale = "zh" | "vi" | "en";

export interface Entity {
  tag: string;
  name: string;
  rows: { label: string; value: string }[];
}

export interface Translations {
  nav: {
    single: string;
    batch: string;
    home: string;
    quote: string;
  };
  route: {
    startSub: string;
    startName: string;
    endSub: string;
    endName: string;
    distanceCaption: string;
    badgeLabel: string;
  };
  tools: {
    navLabel: string;
    pageTitle: string;
    pageSubtitle: string;
    breadcrumbHome: string;
    breadcrumbTools: string;
    openNewWindow: string;
    iframeLoading: string;
    sectionEyebrow: string;
    sectionTitle: string;
    quoteTitle: string;
    quoteDesc: string;
    loaderTitle: string;
    loaderDesc: string;
    quoteBadge: string;
    loaderBadge: string;
    quoteCta: string;
    loaderCta: string;
    quoteTo3dCta: string;
  };
  planner: {
    title: string;
    subtitle: string;
    placeholder: string;
    send: string;
    exampleA: string;
    thinking: string;
    parseFailed: string;
    planFailed: string;
    vehicleLabel: string;
    loadRateLabel: string;
    placedLabel: string;
    weightLabel: string;
    cgLabel: string;
    unplacedLabel: string;
    costLabel: string;
    changeVehicle: string;
    openWorkbench: string;
    exportCsv: string;
    exported: string;
  };
  site: {
    nav: {
      about: string;
      services: string;
      solutions: string;
      cases: string;
      network: string;
      contact: string;
      quote: string;
      aiEmployee: string;
    };
    hero: {
      eyebrow: string;
      title: string;
      lead: string;
      primary: string;
      secondary: string;
      stats: { value: string; label: string }[];
      badge1: string;
      badge2: string;
      badge3: string;
    };
    about: {
      eyebrow: string;
      title: string;
      body: string[];
      mission: { label: string; text: string };
      vision: { label: string; text: string };
      values: { name: string; body: string }[];
    };
    howItWorks: {
      eyebrow: string;
      title: string;
      intro: string;
      steps: { title: string; body: string }[];
    };
    quickQuote: {
      eyebrow: string;
      title: string;
      intro: string;
      originLabel: string;
      originPlaceholder: string;
      destLabel: string;
      destPlaceholder: string;
      weightLabel: string;
      weightPlaceholder: string;
      typeLabel: string;
      submit: string;
      calculating: string;
      resultTitle: string;
      totalLabel: string;
      distanceLabel: string;
      modelLabel: string;
      vehicleLabel: string;
      vehicleAuto: string;
      note: string;
      fullTool: string;
      error: string;
      tabQuote: string;
      tabAI: string;
      tabMap: string;
    };
    services: {
      eyebrow: string;
      title: string;
      intro: string;
      items: { title: string; body: string; points: string[] }[];
    };
    solutions: {
      eyebrow: string;
      title: string;
      intro: string;
      items: { sector: string; title: string; body: string }[];
    };
    vehicles: {
      eyebrow: string;
      title: string;
      intro: string;
      items: { title: string; body: string; spec: string }[];
    };
    network: {
      eyebrow: string;
      title: string;
      intro: string;
      china: { flag: string; name: string; body: string; points: string[] };
      vietnam: { flag: string; name: string; body: string; points: string[] };
      note: string;
    };
    aiAssistant: {
      eyebrow: string;
      title: string;
      intro: string;
      hint1: string;
      hint2: string;
      hint3: string;
      example: string;
      fabLabel: string;
      fabOpen: string;
      fabClose: string;
    };
    cases: {
      eyebrow: string;
      title: string;
      intro: string;
      items: {
        id: string;
        title: string;
        type: string;
        body: string;
        tags: string[];
        image: string;
        gallery: string[];
        overview: string;
        details: { label: string; value: string }[];
        services: string[];
        results: string[];
      }[];
      note: string;
      back: string;
      related: string;
      allCases: string;
    };
    company: {
      eyebrow: string;
      title: string;
      intro: string;
      entities: Entity[];
    };
    contact: {
      eyebrow: string;
      title: string;
      intro: string;
      cta: string;
      details: { label: string; value: string; pending?: boolean }[];
    };
    footer: {
      intro: string;
      siteTitle: string;
      toolsTitle: string;
      contactTitle: string;
      rights: string;
      officialSite: string;
    };
  };
  header: {
    title: string;
  };
  common: {
    calculating: string;
  };
  addressSearch: {
    originPlaceholder: string;
    destPlaceholder: string;
    searching: string;
    searchFailed: string;
  };
  mapView: {
    origin: string;
    destination: string;
    waypoint: (index: number) => string;
    layers: {
      street: string;
      satellite: string;
      terrain: string;
      dark: string;
    };
    escToCancel: string;
  };
  quoteForm: {
    steps: { route: string; cargo: string; vehicle: string; cost: string };
    route: {
      originAddressLabel: string;
      originLatLabel: string;
      originLngLabel: string;
      pickOriginButton: string;
      pickingOrigin: string;
      destAddressLabel: string;
      destLatLabel: string;
      destLngLabel: string;
      pickDestButton: string;
      pickingDest: string;
      waypointsLabel: string;
      addWaypoint: string;
      deleteWaypoint: string;
      waypointIndex: (index: number) => string;
      waypointPlaceholder: string;
    };
    cargo: {
      weightLabel: string;
      volumeLabel: string;
      typeLabel: string;
      rateSuffix: (rate: number) => string;
      valueLabel: string;
      itemsTitle: string;          // 🆕 单件货物明细
      itemsCollapse: string;       // 🆕 收起明细
      itemsExpand: string;         // 🆕 展开明细
      itemsHint: string;           // 🆕 提示文案
      itemsAdd: string;            // 🆕 添加一件
      itemsRemove: string;         // 🆕 删除
      itemsName: string;           // 🆕 名称
      itemsCount: string;          // 🆕 数量
      itemsLength: string;         // 🆕 长 (m)
      itemsWidth: string;          // 🆕 宽 (m)
      itemsHeight: string;         // 🆕 高 (m)
      itemsStackable: string;      // 🆕 可堆叠
      itemsSplitWarn: (n: number) => string;  // 🆕 超长将拆分 N 辆
      itemsAutoExpandHint: string; // 🆕 超大件/重设备提示展开
    };
    vehicle: {
      loadingModeLabel: string;
      loadingModeConsolidatedLabel: string;
      loadingModeFullTruckLabel: string;
      loadingModeConsolidatedHint: string;
      loadingModeFullTruckHint: string;
      modelLabel: string;
      selectModel: string;
      specs: (maxLoad: number, fuel: number, rate: number, volume: number | null) => string;
      recommendedSuffix: string;
      suggestion: (cargoType: string, options: string) => string;
      emptyReturnLabel: string;
      needLoadingLabel: string;
      avoidRestrictedZonesLabel: string;
      avoidConstructionZonesLabel: string;
      viaMountainRoadLabel: string;
    };
    cost: {
      fuelPriceLabel: string;
      wageLabel: string;
      tollRateLabel: string;
      miscCostLabel: string;
      autoDefaultsHint: string;
    };
    buttons: {
      prev: string;
      next: string;
      submit: string;
      submitting: string;
      compare: string;
      comparing: string;
    };
  };
  border: {
    sectionTitle: string;
    transportMode: string;
    land: string;
    sea: string;
    hsCodeLabel: string;
    containerType: string;
    containerCount: string;
    chinaExport: string;
    borderCrossing: string;
    vietnamImport: string;
    importDuty: string;
    vat: string;
    subtotal: string;
    ddpTotal: string;
    transportLabel: string;
    // 🆕 两端分开报价
    modeToggle: string;
    transportOnly: string;
    ddpFull: string;
    transportOnlyHint: string;
    ddpFullHint: string;
    chinaSideTitle: string;
    vietnamSideTitle: string;
    ddpFullTotal: string;
    rateSource: string;
    itemLabels: Record<string, string>;
  };
  costPanel: {
    expandDetail: string;
    viewFullDetail: string;
    collapseDetail: string;
    volumeRatio: (pct: string) => string;
    panelTitle: string;
    collapsePanel: string;
    expandPanel: string;
    singleCostLabel: string;
    settingsTitle: string;
    calculating: string;
    fillFormHint: string;
    totalCost: string;
    distance: string;
    drivingTime: string;
    totalDuration: string;
    costPerKm: string;
    costPerTonKm: string;
    breakdownTitle: string;
    fullTruckBreakdownTitle: string;
    distanceCost: string;
    fullTruckDistanceCost: string;
    timeCost: string;
    fuelCost: string;
    loadingCost: string;
    insuranceCost: string;
    tollCost: string;
    portCost: string;
    bodySurchargeCost: string;
    restrictedZoneCost: string;
    constructionZoneCost: string;
    mountainRoadCost: string;
    miscCost: string;
    matchedModelLabel: string;
    capacityRatioLabel: string;
    suggestionsTitle: string;
    hours: string;
  };
  templateBar: {
    title: string;
    saveAsTemplate: string;
    manage: (count: number) => string;
    collapse: string;
    noTemplates: string;
    load: string;
    delete: string;
    promptName: string;
    confirmDelete: string;
    saveFailed: string;
    deleteFailed: string;
    loadFailed: string;
  };
  routeOptions: {
    title: (count: number) => string;
    option: (index: number) => string;
    cheapest: string;
    fastest: string;
    distanceAndTime: (distance: string, time: string) => string;
  };
  batch: {
    title: string;
    downloadTemplate: string;
    chooseFile: string;
    selectedFile: (name: string) => string;
    startCalc: (count: number) => string;
    calculating: string;
    parseFailed: string;
    parseErrorsTitle: string;
    summary: (total: number, success: number, failed: number) => string;
    filterAll: string;
    filterSuccess: string;
    filterFailed: string;
    export: string;
    colIndex: string;
    colLoadingMode: string;
    colVehicle: string;
    colCargo: string;
    colDistance: string;
    colCost: string;
    colStatus: string;
    statusSuccess: string;
    statusFailed: (error: string) => string;
    batchFailed: string;
  };
  errors: {
    setOriginDest: string;
    invalidWeight: string;
    computeFailed: string;
    alternativesFailed: string;
    loadVehiclePresetsFailed: string;
    volumeRequiredForConsolidated: string;
    selectVehicleModel: string;
    stepOriginRequired: string;
    stepDestRequired: string;
    stepWeightRequired: string;
    stepVolumeRequired: string;
    stepVehicleRequired: string;
    stepCargoTypeRequired: string;
  };
  labels: {
    vehicleCategory: Record<string, string>;
    cargoType: Record<string, string>;
    loadingMode: Record<string, string>;
  };
  suggestions: {
    heavy_load: string;
    empty_return_charged: string;
    overnight_rest: string;
    mismatched_cargo: (cargoType: string) => string;
    restricted_zone: string;
    construction_zone: string;
    mountain_road: string;
    consolidated_match: (modelName: string, capacityPct: string) => string;
  };
  cargoEstimate: {
    title: string;
    disclaimer: string;
    exportFee: string;
    importFee: string;
    perVehicle: string;
    estimatedDuty: string;
    estimatedVat: string;
    preciseNote: string;
  };
  multiTruck: {
    trucksNeeded: (weight: string | number, maxLoad: string | number, count: string | number) => string;
    oneTruckEnough: (pct: string | number) => string;
    perVehicle: (count: string | number, cost: string) => string;
    vehicleCount: string;
  };
}
