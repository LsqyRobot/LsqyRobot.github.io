$CharacterEncoding = "UTF-8";
ClearAll["Global`*"];

baseDirectory = If[StringQ[$InputFileName] && StringLength[$InputFileName] > 0,
  DirectoryName[$InputFileName], Directory[]];
outputDir = FileNameJoin[{baseDirectory, "animation-output"}];
If[!DirectoryQ[outputDir], CreateDirectory[outputDir, CreateIntermediateDirectories -> True]];

jm0 = 0.002; jl0 = 0.018; k0 = 2000.; d0 = 1.;
motorColor = RGBColor[0.12, 0.38, 0.74];
loadColor = RGBColor[0.88, 0.34, 0.16];
springColor = RGBColor[0.95, 0.72, 0.16];

antiFrequency[jl_, k_] := Sqrt[k/jl]/(2 Pi);
resonanceFrequency[jm_, jl_, k_] := Sqrt[k (1/jm + 1/jl)]/(2 Pi);
equivalentInertia[jm_, jl_] := jm jl/(jm + jl);

motorTF[f_, jm_, jl_, k_, d_] := Module[{s = I 2 Pi f, a, den},
  a = k + d s;
  den = (jm s^2 + a) (jl s^2 + a) - a^2;
  (jl s^2 + a)/den
];
loadTF[f_, jm_, jl_, k_, d_] := Module[{s = I 2 Pi f, a, den},
  a = k + d s;
  den = (jm s^2 + a) (jl s^2 + a) - a^2;
  a/den
];
motorFlexibleFactor[f_, jm_, jl_, k_, d_] := Module[{s = I 2 Pi f, jeq = equivalentInertia[jm, jl]},
  (jl s^2 + d s + k)/(jeq s^2 + d s + k)
];
loadFlexibleFactor[f_, jm_, jl_, k_, d_] := Module[{s = I 2 Pi f, jeq = equivalentInertia[jm, jl]},
  (d s + k)/(jeq s^2 + d s + k)
];
toDB[z_] := Clip[20 Log[10, Max[Abs[N[z]], 10^-12]], {-55., 55.}];

springLine[x1_, x2_, y_, relative_] := Line[
  Table[{x1 + (x2 - x1) t, y + 0.10 Sin[12 Pi t] + 0.18 relative (t - 1/2)}, {t, 0, 1, 1/70}]
];

storyFrame[f_, jm_, jl_, k_, d_, phase_, headline_, detail_] := Module[
  {thetaM, thetaL, scale, qM, qL, motorAngle, loadAngle, relative, fAR, fR,
   frequencyGrid, motorData, loadData, motorNow, loadNow, mechanism, response, combined},

  thetaM = motorTF[f, jm, jl, k, d];
  thetaL = loadTF[f, jm, jl, k, d];
  scale = Max[Abs[thetaM], Abs[thetaL], 10^-12];
  qM = Re[(thetaM/scale) Exp[I phase]];
  qL = Re[(thetaL/scale) Exp[I phase]];
  motorAngle = 0.9 qM;
  loadAngle = 0.75 qL;
  relative = qM - qL;
  fAR = antiFrequency[jl, k];
  fR = resonanceFrequency[jm, jl, k];

  mechanism = Graphics[
    {
      Directive[GrayLevel[0.82], Thick], Line[{{-4.8, -1.1}, {4.8, -1.1}}],
      EdgeForm[Directive[GrayLevel[0.25], Thick]], motorColor,
      Rectangle[{-4.5, -0.72}, {-2.7, 0.72}],
      Lighter[motorColor, 0.72], Disk[{-3.0, 0}, 0.60],
      motorColor, Disk[{-3.0, 0}, 0.09],
      Directive[motorColor, Thick],
      Line[{{-3.0, 0}, {-3.0, 0} + 0.50 {Cos[motorAngle], Sin[motorAngle]}}],
      Directive[GrayLevel[0.35], Thick], Line[{{-2.4, 0}, {-2.1, 0}}],
      Directive[springColor, AbsoluteThickness[4]], springLine[-2.1, 0.9, 0, relative],
      Directive[GrayLevel[0.35], Thick], Line[{{0.9, 0}, {1.2, 0}}],
      loadColor, Disk[{1.5, 0}, 0.48],
      Directive[loadColor, AbsoluteThickness[10], CapForm["Round"]],
      Line[{{1.5, 0}, {1.5, 0} + 2.15 {Cos[loadAngle], Sin[loadAngle]}}],
      loadColor, Disk[{1.5, 0} + 2.15 {Cos[loadAngle], Sin[loadAngle]}, 0.18],
      Black,
      Text[Style["电机", 13, Bold], {-3.55, -0.93}],
      Text[Style["柔性组件", 13, Bold], {-0.6, -0.63}],
      Text[Style["负载连杆", 13, Bold], {2.75, -0.93}],
      Text[Style[headline, 15, Bold, Darker[Purple]], {0, 1.55}],
      Text[Style[detail, 12, GrayLevel[0.2]], {0, 1.20}],
      Text[Style[Row[{"f = ", NumberForm[f, {6, 1}], " Hz    |    电机/负载幅值比 = ",
        NumberForm[Abs[thetaM/thetaL], {5, 3}]}], 12], {0, 0.91}]
    },
    PlotRange -> {{-5., 5.}, {-1.35, 1.85}},
    ImageSize -> {430, 315}, Background -> White
  ];

  frequencyGrid = 10.^Subdivide[0., Log[10, 400.], 190];
  motorData = ({#, toDB[motorFlexibleFactor[#, jm, jl, k, d]]} &) /@ frequencyGrid;
  loadData = ({#, toDB[loadFlexibleFactor[#, jm, jl, k, d]]} &) /@ frequencyGrid;
  motorNow = toDB[motorFlexibleFactor[f, jm, jl, k, d]];
  loadNow = toDB[loadFlexibleFactor[f, jm, jl, k, d]];

  response = ListLogLinearPlot[
    {motorData, loadData}, Joined -> True,
    PlotStyle -> {Directive[motorColor, Thick], Directive[loadColor, Thick]},
    Frame -> True, FrameLabel -> {"频率 (Hz)", "柔性响应 (dB)"},
    PlotRange -> {{1., 400.}, {-55., 55.}},
    GridLines -> {{fAR, fR, f}, {0}},
    GridLinesStyle -> Directive[GrayLevel[0.72], Dashed],
    Epilog -> {
      motorColor, PointSize[0.020], Point[{f, motorNow}],
      loadColor, PointSize[0.020], Point[{f, loadNow}],
      Black,
      Text[Style["fAR", 11, Bold], {fAR, 49}],
      Text[Style["fR", 11, Bold], {fR, 42}],
      Text[Style[Row[{"Jm=", NumberForm[jm, {5, 4}], "   Jl=", NumberForm[jl, {5, 3}],
        "   D=", NumberForm[d, {4, 2}]}], 9], {2, -48}, {-1, 0}]
    },
    ImageSize -> {410, 315}, BaseStyle -> {FontFamily -> "Microsoft YaHei", 11},
    PlotLabel -> Style["运动与频响中的当前位置同步", 14, Bold]
  ];

  combined = GraphicsRow[{mechanism, response}, Spacings -> 8, Background -> White];
  Rasterize[combined, "Image", RasterSize -> {840, 360}, ImageResolution -> 96]
];

phaseFor[i_] := 2 Pi Mod[i - 1, 16]/16;

fAR0 = antiFrequency[jl0, k0];
fR0 = resonanceFrequency[jm0, jl0, k0];
frequencySchedule = Join[
  Subdivide[20., fAR0, 17], ConstantArray[fAR0, 12],
  Subdivide[fAR0, fR0, 23], ConstantArray[fR0, 12], Subdivide[fR0, 230., 7]
];
frequencyFrames = MapIndexed[
  Function[{f, index},
    storyFrame[f, jm0, jl0, k0, d0, phaseFor[First[index]],
      Which[
        Abs[f - fAR0] < 0.02 fAR0, "抗谐振：电机突然接近不动",
        Abs[f - fR0] < 0.02 fR0, "谐振：两侧反相，柔性模态被点燃",
        f < fAR0, "低频：电机与负载近似一起运动",
        True, "扫频：幅值和相位正在重新分配"
      ],
      Row[{"fAR = ", NumberForm[fAR0, {5, 1}], " Hz，fR = ", NumberForm[fR0, {5, 1}], " Hz"}]
    ]
  ], frequencySchedule
];

dampingSchedule = Join[10.^Subdivide[Log[10, 0.05], Log[10, 5.], 29], 10.^Subdivide[Log[10, 5.], Log[10, 0.05], 29]];
dampingFrames = MapIndexed[
  Function[{d, index},
    storyFrame[fAR0, jm0, jl0, k0, d, phaseFor[First[index]],
      If[d < 0.25, "阻尼很小：峰与谷像刀锋一样尖", If[d > 3., "阻尼增大：抗谐振节点被填平", "阻尼改变峰谷深度，而非主要位置"]],
      Row[{"固定在理想 fAR，D = ", NumberForm[d, {4, 2}], " N m s/rad"}]
    ]
  ], dampingSchedule
];

loadSchedule = Join[Subdivide[0.008, 0.060, 31], Subdivide[0.060, 0.008, 31]];
loadFrames = MapIndexed[
  Function[{jl, index},
    Module[{fAR = antiFrequency[jl, k0], fixedF = 60.},
      storyFrame[fixedF, jm0, jl, k0, d0, phaseFor[First[index]],
        Which[
          Abs[fixedF - fAR] < 2., "同样的 60 Hz，现在恰好变成抗谐振",
          fixedF < fAR, "负载较轻：抗谐振还在更高频",
          True, "负载变重：抗谐振已经越过 60 Hz"
        ],
        Row[{"只改变 Jl：", NumberForm[jl, {5, 3}], " kg m^2，fAR = ", NumberForm[fAR, {5, 1}], " Hz"}]
      ]
    ]
  ], loadSchedule
];

UsingFrontEnd[
  Export[FileNameJoin[{outputDir, "flexible_joint_frequency_sweep_used.gif"}], frequencyFrames,
    "DisplayDurations" -> 1/12., "AnimationRepetitions" -> Infinity];
  Export[FileNameJoin[{outputDir, "flexible_joint_damping_effect_used.gif"}], dampingFrames,
    "DisplayDurations" -> 1/12., "AnimationRepetitions" -> Infinity];
  Export[FileNameJoin[{outputDir, "flexible_joint_load_effect_used.gif"}], loadFrames,
    "DisplayDurations" -> 1/12., "AnimationRepetitions" -> Infinity];
];

Print["Animation output: ", outputDir];
