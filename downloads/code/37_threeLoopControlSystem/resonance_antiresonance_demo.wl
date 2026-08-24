(* Flexible-joint resonance / antiresonance demonstration
   Wolfram Language 11.3+

   Model:
     Jm thetaM'' = tauM - tauS
     Jl thetaL'' = tauS
     tauS = K (thetaM - thetaL) + D (thetaM' - thetaL')

   The numerical parameters below follow Table 1 of:
   Li Yingli et al., "A Parameters Identification Method for Flexible
   Joints Based on Resonance and Anti-resonance Frequency Characteristics",
   Robot, 43(3), 2021, 279-288.
*)

ClearAll["Global`*"];

jm = 0.002;       (* motor-side inertia, kg m^2 *)
jl0 = 0.018;      (* joint/load-side inertia without external load, kg m^2 *)
k = 2000.;        (* joint stiffness, N m/rad *)
d = 1.;           (* coupling damping, N m s/rad *)

outputDir = Which[
  ValueQ[resonanceOutputDirectory], resonanceOutputDirectory,
  Length[$ScriptCommandLine] >= 2, Last[$ScriptCommandLine],
  True, DirectoryName[$InputFileName]
];
If[! DirectoryQ[outputDir], CreateDirectory[outputDir, CreateIntermediateDirectories -> True]];

jl = jl0;
jeq = jm jl/(jm + jl);
fAR = Sqrt[k/jl]/(2 Pi);
fR = Sqrt[k/jeq]/(2 Pi);

Print["f_AR = ", Round[fAR, 0.01], " Hz"];
Print["f_R  = ", Round[fR, 0.01], " Hz"];

(* Flexible factors after removing the common rigid-body double integrator.
   The motor-side factor has a zero (antiresonance); the load-side factor does not. *)
hm[z_, damping_: d] := (jl z^2 + damping z + k)/(jeq z^2 + damping z + k);
hl[z_, damping_: d] := (damping z + k)/(jeq z^2 + damping z + k);
toDB[value_] := 20 Log[10, Max[Abs[N[value]], 10^-12]];

frequencies = 10.^Subdivide[Log[10, 1.], Log[10, 400.], 1400];
motorData = ({#, toDB[hm[I 2 Pi #]]} &) /@ frequencies;
loadData = ({#, toDB[hl[I 2 Pi #]]} &) /@ frequencies;

markerStyle = Directive[GrayLevel[0.35], Dashed, Thickness[0.002]];
responsePlot = ListLogLinearPlot[
  {motorData, loadData},
  Joined -> True,
  PlotStyle -> {Directive[RGBColor[0.12, 0.38, 0.74], Thick], Directive[RGBColor[0.88, 0.34, 0.16], Thick]},
  PlotLegends -> Placed[{"motor-side response", "load-side response"}, {0.24, 0.2}],
  Frame -> True,
  FrameLabel -> {"frequency (Hz)", "normalized magnitude (dB)"},
  PlotRange -> {{1, 400}, {-35, 35}},
  GridLines -> {{fAR, fR}, Automatic},
  GridLinesStyle -> markerStyle,
  Epilog -> {
    Text[Style["fAR = 53.1 Hz", 12, Bold, GrayLevel[0.25]], {fAR, 32}, {1.1, 0}],
    Text[Style["fR = 167.8 Hz", 12, Bold, GrayLevel[0.25]], {fR, 32}, {-1.1, 0}]
  },
  PlotLabel -> Style["Motor-side antiresonance is a transfer-path zero", 16, Bold],
  ImageSize -> 1050,
  BaseStyle -> {FontFamily -> "Arial", 13}
];

dampingValues = {1., 0.1, 0.01};
dampingData = Table[
  ({#, toDB[hm[I 2 Pi #, dampingValue]]} &) /@ frequencies,
  {dampingValue, dampingValues}
];
dampingPlot = ListLogLinearPlot[
  dampingData,
  Joined -> True,
  PlotStyle -> {Directive[RGBColor[0.13, 0.55, 0.13], Thick], Directive[RGBColor[0.58, 0.2, 0.72], Thick], Directive[Black, Thick]},
  PlotLegends -> Placed[("D = " <> ToString[#]) & /@ dampingValues, {0.22, 0.23}],
  Frame -> True,
  FrameLabel -> {"frequency (Hz)", "motor-side magnitude (dB)"},
  PlotRange -> {{1, 400}, {-75, 75}},
  GridLines -> {{fAR, fR}, Automatic},
  GridLinesStyle -> markerStyle,
  Epilog -> {
    Text[Style["fAR", 12, Bold, GrayLevel[0.25]], {fAR, 68}, {1.1, 0}],
    Text[Style["fR", 12, Bold, GrayLevel[0.25]], {fR, 68}, {-1.1, 0}]
  },
  PlotLabel -> Style["Damping changes peak/notch depth much more than their frequencies", 16, Bold],
  ImageSize -> 1050,
  BaseStyle -> {FontFamily -> "Arial", 13}
];

frfFigure = GraphicsColumn[{responsePlot, dampingPlot}, Spacings -> 20, ImageSize -> 1100];
UsingFrontEnd[Export[FileNameJoin[{outputDir, "flexible_joint_frf_used.png"}], frfFigure, ImageResolution -> 150]];

(* Time-averaged energy partition of the ideal undamped limiting cases.
   At antiresonance the motor is a vibration node.
   At the flexible resonance thetaM/thetaL = -Jl/Jm. *)
antiEnergy = {0., 0.5, 0.5};
resEnergy = {0.5 jl/(jm + jl), 0.5 jm/(jm + jl), 0.5};
motorColor = RGBColor[0.12, 0.38, 0.74];
loadColor = RGBColor[0.88, 0.34, 0.16];
springColor = RGBColor[0.95, 0.72, 0.16];
energyFigure = Graphics[
  {
    EdgeForm[Directive[GrayLevel[0.3], Thin]],
    loadColor, Rectangle[{0.35, 0.}, {1.15, 0.5}],
    springColor, Rectangle[{0.35, 0.5}, {1.15, 1.}],
    motorColor, Rectangle[{1.65, 0.}, {2.45, resEnergy[[1]]}],
    loadColor, Rectangle[{1.65, resEnergy[[1]]}, {2.45, resEnergy[[1]] + resEnergy[[2]]}],
    springColor, Rectangle[{1.65, 0.5}, {2.45, 1.}],
    Black,
    Text[Style["load kinetic\n50%", 14, Bold], {0.75, 0.25}],
    Text[Style["joint elastic\n50%", 14, Bold], {0.75, 0.75}],
    Text[Style["motor kinetic\n45%", 14, Bold, White], {2.05, 0.225}],
    Text[Style["joint elastic\n50%", 14, Bold], {2.05, 0.75}],
    Text[Style["load kinetic 5%", 12, Bold, loadColor], {2.72, 0.475}, {-1, 0}],
    Text[Style["antiresonance", 15, Bold], {0.75, -0.08}],
    Text[Style["resonance", 15, Bold], {2.05, -0.08}]
  },
  Frame -> True,
  FrameTicks -> {{Automatic, None}, {None, None}},
  FrameLabel -> {None, "fraction of time-averaged modal energy"},
  PlotRange -> {{0., 3.25}, {-0.14, 1.08}},
  PlotLabel -> Style["Ideal modal-energy picture (Jm = 0.002, Jl = 0.018 kg m^2)", 16, Bold],
  ImageSize -> 1000,
  BaseStyle -> {FontFamily -> "Arial", 13}
];
UsingFrontEnd[Export[FileNameJoin[{outputDir, "flexible_joint_energy_used.png"}], energyFigure, ImageResolution -> 150]];

(* The paper identifies parameters by repeating the frequency-response experiment
   with several known external inertias. *)
externalInertias = Range[0., 0.5, 0.01];
antiSweep = ({#, Sqrt[k/(jl0 + #)]/(2 Pi)} &) /@ externalInertias;
resSweep = ({#, Sqrt[k (jm + jl0 + #)/(jm (jl0 + #))]/(2 Pi)} &) /@ externalInertias;
loadSweepFigure = ListLinePlot[
  {antiSweep, resSweep},
  PlotStyle -> {Directive[RGBColor[0.12, 0.38, 0.74], Thick], Directive[RGBColor[0.88, 0.34, 0.16], Thick]},
  PlotLegends -> Placed[{"anti-resonance fAR", "resonance fR"}, {0.72, 0.75}],
  Frame -> True,
  FrameLabel -> {"external load inertia (kg m^2)", "frequency (Hz)"},
  GridLines -> Automatic,
  GridLinesStyle -> Directive[GrayLevel[0.85], Dashed],
  PlotRange -> All,
  PlotLabel -> Style["Known load changes expose inertia and stiffness parameters", 16, Bold],
  ImageSize -> 1000,
  BaseStyle -> {FontFamily -> "Arial", 13}
];
UsingFrontEnd[Export[FileNameJoin[{outputDir, "flexible_joint_load_sweep_used.png"}], loadSweepFigure, ImageResolution -> 150]];

(* Run the following expression in a Mathematica notebook for an interactive view.
   The markers show the complex steady-state motor/load amplitudes as frequency changes. *)
interactiveView := Manipulate[
  Module[{z = I 2 Pi frequency, motorAmplitude, loadAmplitude, scale},
    motorAmplitude = hm[z];
    loadAmplitude = hl[z];
    scale = Max[Abs[motorAmplitude], Abs[loadAmplitude], 10^-9];
    Graphics[
      {
        Thick, Gray, Line[{{-4, 0}, {4, 0}}],
        RGBColor[0.12, 0.38, 0.74], Disk[{-2 + 1.2 Re[motorAmplitude/scale], 0}, 0.3],
        RGBColor[0.88, 0.34, 0.16], Disk[{2 + 1.2 Re[loadAmplitude/scale], 0}, 0.3],
        Black, Text[Style["motor", 14], {-2, -0.7}], Text[Style["load", 14], {2, -0.7}],
        Text[Style[Row[{"f = ", NumberForm[frequency, {6, 1}], " Hz"}], 14], {0, 1.1}]
      },
      PlotRange -> {{-4.5, 4.5}, {-1.2, 1.5}}, ImageSize -> 700
    ]
  ],
  {frequency, 1., 300., Appearance -> "Labeled"}
];

Print["Generated figures in: ", outputDir];
