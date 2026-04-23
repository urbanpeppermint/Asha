// -----JS CODE-----
// @input float tracerIntensity {"widget":"slider", "min":0.70, "max":1.0, "step":0.01}
// @input bool advanced
// @input Asset.Material tracerMat {"showIf":"advanced"}
// @input Asset.Material outputMat {"showIf":"advanced"}

function onStart()
{
    script.tracerMat.mainPass.alpha = script.tracerIntensity;
    script.outputMat.mainPass.alpha = script.tracerIntensity;
}
script.createEvent("OnStartEvent").bind(onStart);