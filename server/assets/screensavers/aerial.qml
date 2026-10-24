// Scenic Home screen saver: native Qt animation; no video decoder or audio session.
import QtQuick 2.4
import Eos.Window 0.1
WebOSWindow {
    id: win
    width: 1920; height: 1080
    windowType: "_WEBOS_WINDOW_TYPE_SCREENSAVER"
    appId: "com.webos.app.screensaver"
    title: "Scenic"; visible: true; color: "black"
    property int level: __TVWEB_LEVEL__
    property string api: "__TVWEB_URL__".replace("/api/stats", "/api/home/ambient")
    property var scenes: ["file:///var/lib/tvweb/assets/tvos/fjord-sharp.png", "file:///var/lib/tvweb/assets/tvos/dawn.jpg", "file:///var/lib/tvweb/assets/tvos/night.jpg"]
    property int scene: 0
    property bool frontA: true
    property var headlines: []
    property int headline: 0
    property bool showNews: true
    property int corner: 0
    FontLoader {id: face; source: "file:///var/lib/tvweb/assets/fonts/Manrope-Regular.ttf"}
    Item {
        id: landscape; anchors.fill: parent; clip: true
        Image {id: sceneA; anchors.fill: parent; anchors.margins: -60; source: win.scenes[0]; fillMode: Image.PreserveAspectCrop; asynchronous: true; cache: false; smooth:true; opacity: win.frontA ? .72 : 0; Behavior on opacity { NumberAnimation{duration:2500} }
            SequentialAnimation on scale {loops: Animation.Infinite; NumberAnimation{from:1;to:1.07;duration:85000;easing.type:Easing.InOutSine} NumberAnimation{from:1.07;to:1;duration:85000;easing.type:Easing.InOutSine}}
            transform: Translate {id: glide; SequentialAnimation on x {loops:Animation.Infinite; NumberAnimation{from:-16;to:16;duration:65000} NumberAnimation{from:16;to:-16;duration:65000}}}
        }
        Image {id: sceneB; anchors.fill: parent; anchors.margins: -60; fillMode: Image.PreserveAspectCrop; asynchronous:true;cache:false;smooth:true;opacity:win.frontA?0:.72;Behavior on opacity {NumberAnimation{duration:2500}}
            SequentialAnimation on scale {loops:Animation.Infinite;NumberAnimation{from:1.07;to:1;duration:85000;easing.type:Easing.InOutSine}NumberAnimation{from:1;to:1.07;duration:85000;easing.type:Easing.InOutSine}}
        }
        Rectangle {anchors.fill:parent;gradient:Gradient {GradientStop{position:0;color:"#6001070f"}GradientStop{position:.5;color:"#0001070f"}GradientStop{position:1;color:"#bd01070f"}}}
    }
    Item {
        id: info; x:110;y:580;width:950;height:300
        Behavior on x {NumberAnimation{duration:3000;easing.type:Easing.InOutSine}}
        Behavior on y {NumberAnimation{duration:3000;easing.type:Easing.InOutSine}}
        Text {id: clock; font.family:face.name;font.pixelSize:112;font.weight:Font.Light;color:"#dde5f0"}
        Text {id: dateText;y:142;font.family:face.name;font.pixelSize:26;color:"#c1ccdc"}
        Text {id: weatherText;y:191;font.family:face.name;font.pixelSize:30;color:"#c9d7e7";text:"Local weather"}
    }
    Item {
        id: news; x:110;y:910;width:1640;height:110;opacity:win.showNews&&win.headlines.length?1:0
        Behavior on x {NumberAnimation{duration:3000}}
        Behavior on y {NumberAnimation{duration:3000}}
        Text {id: source;y:0;font.family:face.name;font.pixelSize:17;color:"#98acc4";text:"LOCAL HEADLINES"}
        Text {id: newsText;y:32;width:1640;wrapMode:Text.WordWrap;maximumLineCount:2;elide:Text.ElideRight;font.family:face.name;font.pixelSize:25;color:"#c7d4e4"}
    }
    function refreshClock(){var d=new Date();clock.text=(d.getHours()%12||12)+":"+(d.getMinutes()<10?"0":"")+d.getMinutes()+(d.getHours()<12?" AM":" PM");dateText.text=Qt.formatDate(d,"dddd, MMMM d");}
    function updateHeadline(){if(!headlines.length)return;var h=headlines[headline%headlines.length];newsText.text=h.title;source.text="LOCAL HEADLINES · "+h.source+" · "+Qt.formatDateTime(new Date(h.publishedAt),"MMM d, h:mm AP");headline++;}
    function refresh(){var x=new XMLHttpRequest();x.open("GET",api+(api.indexOf("?")>=0?"&":"?")+"t="+Date.now());x.onreadystatechange=function(){if(x.readyState!==4||x.status!==200)return;try{var r=JSON.parse(x.responseText);if(r.weather&&typeof r.weather.temperature==="number")weatherText.text=r.weather.city+"  ·  "+Math.round(r.weather.temperature)+"°"+(r.weather.unit||"C")+(r.weather.stale?" · Last update":"");showNews=r.newsEnabled;headlines=r.headlines||[];updateHeadline();}catch(e){}};x.send();}
    function move(){corner=(corner+1)%4;info.x=corner%2?820:110;info.y=corner<2?120:600;news.x=corner%2?170:110;news.y=corner<2?850:120;}
    function nextScene(){scene=(scene+1)%scenes.length;if(frontA)sceneB.source=scenes[scene];else sceneA.source=scenes[scene];frontA=!frontA;}
    Timer{interval:10000;running:true;repeat:true;onTriggered:refreshClock()}
    Timer{interval:60000;running:true;repeat:true;onTriggered:move()}
    Timer{interval:90000;running:true;repeat:true;onTriggered:nextScene()}
    Timer{interval:20000;running:true;repeat:true;onTriggered:updateHeadline()}
    Timer{interval:120000;running:true;repeat:true;onTriggered:refresh()}
    Timer{interval:10000;running:true;repeat:false;onTriggered:refresh()}
    Component.onCompleted:{refreshClock();refresh();}
}

