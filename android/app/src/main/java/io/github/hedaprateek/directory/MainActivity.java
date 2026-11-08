package io.github.hedaprateek.directory;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Browser launcher: Google authentication must not run in an embedded WebView. */
public class MainActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout layout=new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);layout.setGravity(Gravity.CENTER);
    int pad=(int)(24*getResources().getDisplayMetrics().density);
    layout.setPadding(pad,pad,pad,pad);
    TextView title=new TextView(this);title.setText(getString(getApplicationInfo().labelRes));title.setTextSize(24);title.setGravity(Gravity.CENTER);layout.addView(title);
    TextView note=new TextView(this);note.setText("Open the directory in your browser and continue with Google. Access needs administrator approval.");note.setTextSize(16);note.setGravity(Gravity.CENTER);note.setPadding(0,pad,0,pad);layout.addView(note);
    Button open=new Button(this);open.setText("Open directory");open.setOnClickListener(v->openDirectory());layout.addView(open);
    TextView credit=new TextView(this);credit.setText("Stunity Tech — by Prateek");credit.setGravity(Gravity.CENTER);credit.setPadding(0,pad,0,0);layout.addView(credit);
    setContentView(layout);
    if(state==null)openDirectory();
  }
  private void openDirectory(){
    try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(BuildConfig.START_URL)));}
    catch(ActivityNotFoundException e){android.widget.Toast.makeText(this,"Install a browser such as Chrome to open the directory.",android.widget.Toast.LENGTH_LONG).show();}
  }
}
