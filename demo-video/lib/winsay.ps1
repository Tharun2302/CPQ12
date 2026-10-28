# Usage: winsay.ps1 -Text <ssml-or-text> -Out <wav> -Engine onecore|sapi -Voice <name-fragment> -Rate <float>
param([string]$TextFile, [string]$Out, [string]$Engine = 'onecore', [string]$Voice = 'Mark', [double]$Rate = 0.92)
$text = Get-Content -Raw -Encoding UTF8 $TextFile
if ($Engine -eq 'sapi') {
  Add-Type -AssemblyName System.Speech
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $v = $s.GetInstalledVoices() | ? { $_.VoiceInfo.Name -like "*$Voice*" } | select -First 1
  $s.SelectVoice($v.VoiceInfo.Name)
  $s.Rate = [int][math]::Round(($Rate - 1) * 10)
  $s.SetOutputToWaveFile($Out)
  $s.Speak($text)
  $s.Dispose()
  exit 0
}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ? { $_.DisplayName -like "*$Voice*" } | select -First 1
$synth.Options.SpeakingRate = $Rate
$stream = Await ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$size = [uint32]$stream.Size
Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
$bytes = New-Object byte[] $size
$reader.ReadBytes($bytes)
[IO.File]::WriteAllBytes($Out, $bytes)
