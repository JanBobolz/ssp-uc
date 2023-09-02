const code_input = document.getElementById('code');
const output = document.getElementById('output');

function session_equals(sess1, sess2) {
    return session_is_prefix(sess1, sess2) && session_is_prefix(sess2, sess1);
}

function session_is_prefix(prefix, session) {
    if (prefix.length > session.length)
        return false;
    for (var i in prefix) {
        if (prefix[i] != session[i])
            return false;
    }
    return true;
}

function session_compare(a,b) {
    if (a.length != b.length)
        return a.length-b.length;
    
    if (a.length == 0)
        return 0; //[] == []
    
    if (a[0] != b[0])
        return a[0].localeCompare(b[0]);

    return session_compare(a.slice(1), b.slice(1));
}

function session_is_proper_prefix(prefix, session) {
    return session_is_prefix(prefix, session) && !session_equals(prefix, session);
}

function session_is_longest_prefix(longestPrefix, session, model) { //session = (longestPrefix, ...)
    if (!session_is_proper_prefix(longestPrefix, session))
        return false;
    //Return true iff there's no box with longer prefix in model.
    return !model['boxes'].some(box => box['session'].length > longestPrefix.length && session_is_proper_prefix(box['session'], session));
}

function get_list_of_box_sessions(model) {
    var sessions = [];
    for (box of model['boxes']) {
        var session = box['session'];
        if (!sessions.some(x => session_equals(session, x)))
            sessions.push(session);
    }

    return sessions.sort((a,b) => session_compare(a,b));
}

function session_to_latex_str(session) {
    return "("+session.map(sessionPart => "\\mathrm{"+sessionPart+"}").join(", ")+")";
}

function annotateModel(model) {
    //Add environment box
    model['boxes'].push({
        name: "Env", 
        session: [], 
        parties: ["*"], 
        methods: [
            {name: "main", party: false, 'caller-session': [], async: true},
            {name: "handle", party: "A", 'caller-session': ["*"], async: true}
        ]
    });

    //Add indices to the boxes
    for (var i in model['boxes']) {
        model['boxes'][i]['index'] = i;
    }

    //Add implicit default values.
    for (var box of model['boxes']) {
        if (!('methods' in box))
            box['methods'] = [];
        if (!('parties' in box))
            box['parties'] = [];
        
        for (var method of box['methods']) {
            //Add caller-session to method if missing, default to box's session minus the last bit
            if (!('caller-session' in method)) {
                if (box['session'].length == 0) {
                    log("Box "+box.name+" needs a non-empty session");
                    return false;
                }
                method['caller-session'] = box['session'].slice(0,-1);
            }

            //Default async flag: false.
            method['async'] = 'async' in method ? true : false;
        }
    }

    //Parse/normalize box role parties
    var partynames = model['boxes'].flatMap(box => box['parties'].map(party => party.replace("honest", "").replace("corrupt", "").trim())).filter(party => party != "*").filter((party, index, self) => self.indexOf(party) === index);
    for (var box of model['boxes']) {
        //Replace * with all parties
        box['parties'] = box['parties'].flatMap(party => partynames.map(name => party.replace("*", " "+name+" ")));

        //Parse parties array into a nicer parties[name] = {'honest': bool, 'corrupt': bool} format.
        var parties = {};
        for (var party of box['parties']) {
            var name = party.replace("honest", "").replace("corrupt", "").trim();
            if (!(name in parties))
                parties[name] = {'honest': false, 'corrupt': false};
            if (party.includes("honest"))
                parties[name]['honest'] = true;
            if (party.includes("corrupt"))
                parties[name]['corrupt'] = true;
            if (!party.includes("honest") && !party.includes("corrupt"))
                parties[name] = {"honest": true, "corrupt": true};
        }
        box['parties'] = parties;
    }

    //Annotate with the unique caller of each method

    window.model = model;
    return model;
}

// Computes the width (in number of boxes) we reserve on the canvas for the given session prefix.
function getWidth(prefix, model) {
    var numBoxesInCurrentSession = model['boxes'].reduce((sum, box) => sum + (session_equals(prefix, box['session']) ? 1 : 0), 0);
    var directChildrenSessions = [];
    for (var session of get_list_of_box_sessions(model)) {
        if (session_is_longest_prefix(prefix, session, model))
            directChildrenSessions.push(session);
    }
    var sumDirectChildrenWidths = directChildrenSessions.reduce((sum, childSession) => sum + getWidth(childSession, model), 0);

    return Math.max(numBoxesInCurrentSession, sumDirectChildrenWidths);
}

function annotatedModelToTikz(model) {
    //Variables. Global to allow other functions to access them.
    boxwidth = 6; //excluding margin. In cm.
    boxmargin = 1; //in cm.
    verticalLayerDistance = 3; 

    var result = "";

    //Draw env
    result += String.raw`
\node (env) at (0,0) [draw,thick,minimum height=2cm,text width = ${(boxwidth+boxmargin)*getWidth([], model)-boxmargin}cm,anchor=north west] 
{
  \textbf{Env}\\ 
  $\mathbf{P} = \mathbb{Z}\times\{honest\}$\\
  Box session: $()$ \\ 
  ~ \\ 
  $\mathrm{async}~ \mathsf{main}()$
};
`
    result += drawProperSubsessionBoxes(0, 1, [], model);

    return result;
}

function drawProperSubsessionBoxes(offset_x_in_cm, offset_y, parentSession, model) {
    var current_session_x_in_cm = offset_x_in_cm;
    var sessions_to_draw = get_list_of_box_sessions(model).filter(sess => session_is_longest_prefix(parentSession, sess, model));
    
    if (sessions_to_draw.length == 0)
        return "";

    //Centering
    var x_space_available = getWidth(parentSession, model)*boxwidth + boxmargin;
    var x_space_needed = sessions_to_draw.reduce((sum, sess) => sum + getWidth(sess, model), 0) * boxwidth + boxmargin*sessions_to_draw.length;
    if (x_space_available > x_space_needed)
        current_session_x_in_cm += (x_space_available - x_space_needed)/2;

    var result = "";
    for (var session_to_draw of sessions_to_draw) {
        var boxes_to_draw = model['boxes'].filter(b => session_equals(b['session'], session_to_draw))
        var x_space_available_for_session_to_draw = getWidth(session_to_draw, model);
        var current_box_x_in_cm = current_session_x_in_cm;

        for (var box of boxes_to_draw) {
            //Draw box
            result += String.raw`
            \node (box${box['index']}) at (${current_box_x_in_cm.toFixed(4)}cm,${(offset_y*verticalLayerDistance).toFixed(4)}cm) [draw,thick,minimum height=2cm,text width = ${boxwidth}cm, anchor=north west] 
            {
                \textbf{${box['name']}}\\
                $\mathbf{P}$ = \{${Object.keys(box['parties']).filter(k => box['parties'][k]['honest'] || box['parties'][k]['corrupt']).map(k => "("+k+", "+(box['parties'][k]['honest'] && box['parties'][k]['corrupt'] ? "both" : box['parties'][k]['honest'] ? "honest" : "corrupt")+")")}\}\\
                Box session: $${session_to_latex_str(box['session'])}$ \\ 
                ~ \\ 
            `;
            
            //Draw methods
            for (var method of box['methods']) {
                result += String.raw`
                ${method['async'] ? "\mathrm{async}~" : ""}$\mathsf{${method['name']}}_{${session_to_latex_str(box['session'])}}^{${session_to_latex_str(method['caller-session'])}}()$
                `;
            }

            result += String.raw`   
            };
            `
            current_box_x_in_cm += boxwidth+boxmargin;
        }
        result += drawProperSubsessionBoxes(current_session_x_in_cm, offset_y+1, session_to_draw, model);
        current_session_x_in_cm += x_space_available_for_session_to_draw*(boxwidth+boxmargin);
    }
    return result;
}

function compile() {
    //Parse yaml
    var model = jsyaml.load(document.getElementById("yaml").value);
    console.log(model);
    
    //Annotate model
    var annotatedModel = annotateModel(model);
    console.log(annotatedModel);

    //Compile model to tikz (or handle error)
    if (annotatedModel){
        result = annotatedModelToTikz(annotatedModel);
        code_input.value = result;
    } else {
        code_input.value = "\\node[] {Invalid model. See browser log.};";
    }

    update();
}

function update() {
  const s = document.createElement('script');
  s.setAttribute('type','text/tikz');
  s.textContent = `
\\newcommand{\\mathbb}[1]{\\mathbf{#1}} %workaround for mathbb
\\renewcommand{\\times}{~\\mathsf{x}~}
\\begin{tikzpicture}
${code_input.value}
\\end{tikzpicture}
  `;
  output.innerHTML = '';
  output.appendChild(s);
  process_tikz(s);
}

let debounce_update = null;
let debounce_do = false;
  