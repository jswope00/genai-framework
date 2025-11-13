<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Finalizing your access…</title>
  <meta http-equiv="refresh" content="6">
</head>
<body>
  <div style="font-family:sans-serif;max-width:520px;margin:64px auto;text-align:center;">
    <h2>${(message)!'Finalizing your access…'}</h2>
    <p>We’re finalizing your setup. This usually takes a few seconds…</p>

    <#-- optional debug -->
    <#if debugUserId??>
      <p style="opacity:.6">userId: ${debugUserId}</p>
    </#if>

    <#-- Prefer loginAction; if absent, fall back to restart URL -->
    <#assign postUrl = (url.loginAction)!((url.loginRestartFlowUrl)!'#')>

    <#if postUrl?has_content && postUrl != '#'>
      <form id="retry" action="${postUrl}" method="post"></form>
      <script>
        setTimeout(function(){
          var f = document.getElementById('retry');
          if (f) f.submit();
          else location.href = "${(url.loginRestartFlowUrl)!'/realms/' + (realm.name)! + '/protocol/openid-connect/auth'}";
        }, 1800);
      </script>
      <noscript>
        <p><a href="${postUrl}">Continue</a></p>
      </noscript>
    <#else>
      <p><a href="${(url.loginRestartFlowUrl)!'/'}">Restart login</a></p>
    </#if>
  </div>
</body>
</html>
