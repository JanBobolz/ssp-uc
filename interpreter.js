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

function session_is_prefix_with_star(prefix, methodSessionWithStar) {
    if (methodSessionWithStar[methodSessionWithStar.length-1] != "*")
        return false;
    if (prefix.length < methodSessionWithStar.length-1) //prefix is too short
        return false;
    return session_equals(prefix.slice(0, methodSessionWithStar.length-1), methodSessionWithStar.slice(0, methodSessionWithStar.length-1));
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
    if (!session_is_prefix(longestPrefix, session))
        return false;
    //Return true iff there's no box with longer prefix in model.
    return !model['boxes'].some(box => box['session'].length > longestPrefix.length && session_is_prefix(box['session'], session));
}

function session_is_longest_proper_prefix(longestPrefix, session, model) { //session = (longestPrefix, ...)
    if (!session_is_proper_prefix(longestPrefix, session))
        return false;
    //Return true iff there's no box with longer proper prefix in model.
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

function parties_to_latex_str(parties, force_set = false) {
    var rollout = [];
    for (var partyName in parties) {
        var party = parties[partyName];
        if (party['honest'])
            rollout.push("\\mathrm{"+partyName+"}");
        if (party['corrupt'])
            rollout.push("\\mathrm{"+partyName+"}^{*}");
    }

    if (force_set || rollout.length != 1)
        return "\\{"+rollout.join(", ")+"\\}";
    else
        return rollout.join(", ");
}

function method_to_latex_str(method, box, callerSession = false, callerParties = false, printAsync = true) {
    if (callerSession === false)
        callerSession = method['caller-session'];
    if (callerParties === false)
        callerParties = method['caller-parties'];
    return String.raw`${method['async'] && printAsync ? "async " : ""} $ ${parties_to_latex_str(callerParties)}.\mathsf{${method['name']}}_{${session_to_latex_str(box['session'])}}^{${session_to_latex_str(callerSession)}}()$`
}

function annotateModel(model) {
    //Add environment box
    model['boxes'].unshift({
        name: "Env", 
        session: [], 
        parties: ["*"], 
        methods: [
            //{name: "main", party: "Experiment", 'caller-session': [], async: true},
            {name: "handle", party: "A", 'caller-session': ["*"], async: true}
        ]
    });

    //Add indices to the boxes
    for (var i in model['boxes']) {
        model['boxes'][i]['index'] = i; //env gets 0
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

            //Default no parties
            if (!('caller-parties' in method)) {
                method['caller-parties'] = [];
            }

            //Default async flag: false.
            method['async'] = 'async' in method && method['async'] != "false" ? true : false;
        }
    }

    //Parse parties array into a nicer parties[name] = {'honest': bool, 'corrupt': bool} format. Name may be special "*"
    function partyArrayToNiceDict(partyArray) {
        var parties = {};
        for (var party of partyArray) {
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
        return parties;
    }


    //Parse/normalize box/method role parties
    for (var box of model['boxes']) {
        box['parties'] = partyArrayToNiceDict(box['parties']);
        for (var method of box['methods']) {
            method['caller-parties'] = partyArrayToNiceDict(method['caller-parties']);
        }
    }

    //Annotate each method with its caller boxes (unique in theory, but here, one "method" may have * qualifiers)
    for (var callerBox of model['boxes']) {
        callerBox['imports'] = [];

        // Parties: Every party specification comes with honest/corrupt flags. Special "*" party for both box parties and method parties, meaning plays role of all parties / can be called by all parties. 
        //    so don't normalize away the * anymore. Instead, keep it as special party name.
        // Sessions: Boxes have concrete sessions (no *). Methods can use "*" as placeholder (can be empty), which creates copies of all possible instantiations of *. 
        //    so what methods can box with session s call? First, check that s starts with the method's session before the *. Then, can call method with [s,*], except where it's shadowed. Meaning that from [s,*], we have to exclude all sessions of the form [s,s',*]. We cannot call those. 
        console.log(callerBox['name']);
        for (var calleeBox of model['boxes']) {
            if (calleeBox == callerBox)
                continue;
            for (var method of calleeBox['methods']) {
                //Check session
                var effectiveCallSession; //example format: [s1, s2, *]
                var shadowingBoxes;
                if (session_is_prefix_with_star(callerBox['session'], method['caller-session'])) {
                    console.log("Prefix with star", callerBox['session'], method['caller-session']);
                    //Box session is s. method::caller-session is of form [{substring of s},*]. 
                    //So we can call the method with session [s,*], except where it's shadowed by another box that can make the call for [s',*] with s prefix of s'.
                    effectiveCallSession = callerBox['session'].concat(["*"]);

                    //Find boxes that shadow callerBox
                    shadowingBoxes = model['boxes'].filter(box => session_is_prefix_with_star(box['session'], method['caller-session']) && session_is_proper_prefix(callerBox['session'],box['session']));
                    if (shadowingBoxes.some(box => box['session'].length < method['caller-session'].length))
                        continue; //some shadowingBox shadows our callerBox's call completely. So callerBox cannot call the method at all.
                } else if (method['caller-session'][method['caller-session'].length-1] != "*" && session_is_longest_prefix(callerBox['session'], method['caller-session'], model)) {
                    //Easy case: method's caller-session specification has no *. So just do longest-prefix rule. No shadowing
                    console.log("Prefix no star", callerBox['session'], method['caller-session']);
                    shadowingBoxes = [];
                    effectiveCallSession = method['caller-session'];
                } else {
                    console.log("No prefix", callerBox['session'], method['caller-session']);
                    continue; //Cannot call method because session prohibits it.
                }
                console.log(effectiveCallSession);
                console.log("Parties", callerBox['parties'], method['caller-parties']);
                //Collect parties on behalf of which callerBox can call this method.
                var effectiveCallParty = {}; //will be something like {"P1": {honest: true, corrupt:true}, ...} or {"*" : {honest: true, corrupt: true}, "Foo": {honest: true, corrupt: false}, "bar": {honest: false, corrupt: true}}
                for (var partyName in method['caller-parties']) {
                    console.log("Compare", partyName, callerBox['parties']);
                    effectiveCallParty[partyName] = {'honest': false, "corrupt": false};
                    if (partyName in callerBox['parties']) { //if caller has this exact party, apply that party's privileges.
                        effectiveCallParty[partyName]['honest'] = callerBox['parties'][partyName]['honest'];
                        effectiveCallParty[partyName]['corrupt'] = callerBox['parties'][partyName]['corrupt'];
                    }
                    if ("*" in callerBox['parties']) { //if caller plays all parties, apply their privileges.
                        effectiveCallParty[partyName]['honest'] = effectiveCallParty[partyName]['honest'] || callerBox['parties']['*']['honest'];
                        effectiveCallParty[partyName]['corrupt'] = effectiveCallParty[partyName]['corrupt'] || callerBox['parties']['*']['corrupt'];
                    }
                    //Make sure we're not calling methods for parties for which they aren't defined.
                    effectiveCallParty[partyName]['honest'] = effectiveCallParty[partyName]['honest'] && method['caller-parties'][partyName]['honest'];
                    effectiveCallParty[partyName]['corrupt'] = effectiveCallParty[partyName]['corrupt'] && method['caller-parties'][partyName]['corrupt'];
                }
                console.log(effectiveCallParty)
                //Remove redundant parties when * is involved
                if ("*" in effectiveCallParty) {
                    for (var partyName in effectiveCallParty) {
                        if (partyName == "*")
                            continue;
                        if (effectiveCallParty["*"]['honest'])
                            effectiveCallParty[partyName]['honest'] = false;
                        if (effectiveCallParty["*"]['corrupt'])
                            effectiveCallParty[partyName]['corrupt'] = false;
                        if (effectiveCallParty[partyName]['honest'] == false && effectiveCallParty[partyName]['corrupt'] == false)
                            delete effectiveCallParty[partyName];
                    }
                }
                console.log("After normalize", effectiveCallParty);

                if (Object.keys(effectiveCallParty).length === 0)
                    continue; //No party can call this method. Skip it.
                
                //Save data
                callerBox['imports'].push({'box': calleeBox, 'method': method, 'effectiveSession': effectiveCallSession, 'effectiveParty': effectiveCallParty, 'shadowingBoxes': shadowingBoxes});
            }
        }
    }

    window.model = model;
    return model;
}

// Computes the width (in cm) we reserve on the canvas for the given session prefix.
function getWidth(prefix, model) {
    var numBoxesInCurrentSession = model['boxes'].reduce((sum, box) => sum + (session_equals(prefix, box['session']) ? 1 : 0), 0);
    var directChildrenSessions = [];
    for (var session of get_list_of_box_sessions(model)) {
        if (session_is_longest_proper_prefix(prefix, session, model))
            directChildrenSessions.push(session);
    }
    var sumDirectChildrenWidths = directChildrenSessions.reduce((sum, childSession) => sum + getWidth(childSession, model), 0);

    return Math.max(numBoxesInCurrentSession*(boxwidth+boxmargin), sumDirectChildrenWidths);
}

function annotatedModelToTikz(model) {
    //Variables. Global to allow other functions to access them.
    boxwidth = 7; //excluding margin. In cm.
    boxmargin = 1; //in cm.
    verticalLayerDistance = 4; 

    var result = "";

    //Draw env
    result += String.raw`
            \node (box0) at (0,0) [draw,thick,minimum height=2cm,text width = ${getWidth([], model)}cm,anchor=north west] 
            {
                \textbf{Env}\\ 
                $\mathbf{P} = \mathbb{Z}\times\{honest\}$\\
                Box session: $()$ \\ 
                ~ \\ 
                async $\mathsf{main}()$
            };
            `
    
    //Draw other boxes
    result += drawProperSubsessionBoxes(0, verticalLayerDistance, [], model);
    
    //Draw arrows
    for (var callerBox of model['boxes']) {
        for (var calleeBox of model['boxes']) {
            if (calleeBox == callerBox)
                continue;
            
            var midway = `lineBox${callerBox['index']}ToBox${calleeBox['index']}`
            var arrowLabel = "";
            for (var importData of callerBox['imports']) {
                if (importData['box']['index'] != calleeBox['index'])
                    continue;
                arrowLabel += method_to_latex_str(importData['method'], calleeBox, importData['effectiveSession'], importData['effectiveParty'], printAsync = true);
                arrowLabel += "\\\\";
            }

            if (arrowLabel != "")
                result += String.raw`
                    \draw[->,thick,draw=black!30!white] (box${callerBox['index']}) -- (box${calleeBox['index']}) node [midway] (${midway}) {};
                    \node[anchor=west, text width=1cm] at (${midway}) {${arrowLabel}};
                `
        }
    }


    return result;
}

function drawProperSubsessionBoxes(offset_x, offset_y, parentSession, model) {
    var current_session_x = offset_x;
    var sessions_to_draw = get_list_of_box_sessions(model).filter(sess => session_is_longest_proper_prefix(parentSession, sess, model));
    
    if (sessions_to_draw.length == 0)
        return "";

    //Centering
    var x_space_available = getWidth(parentSession, model);
    var x_space_needed = sessions_to_draw.reduce((sum, sess) => sum + getWidth(sess, model), 0);
    if (x_space_available > x_space_needed)
        current_session_x += (x_space_available - x_space_needed)/2;

    var result = "";
    for (var session_to_draw of sessions_to_draw) {
        var boxes_to_draw = model['boxes'].filter(b => session_equals(b['session'], session_to_draw))
        var x_space_available_for_session_to_draw = getWidth(session_to_draw, model);
        var current_box_x = current_session_x;

        for (var box of boxes_to_draw) {
            //Draw box
            result += String.raw`
            \node (box${box['index']}) at (${(current_box_x+boxmargin/2).toFixed(4)}cm,${offset_y.toFixed(4)}cm) [draw,thick,minimum height=2cm,text width = ${boxwidth}cm, anchor=north west] 
            {
                \textbf{${box['name']}}\\
                $\mathbf{P} = ${parties_to_latex_str(box['parties'], true)}$\\
                Box session: $${session_to_latex_str(box['session'])}$ \\ 
                ~ \\ 
            `;
            
            //Draw methods
            for (var method of box['methods']) {
                result += method_to_latex_str(method, box)+"\n";
            }

            result += String.raw`   
            };
            `
            current_box_x += boxwidth+boxmargin;
        }
        result += drawProperSubsessionBoxes(current_session_x, offset_y+verticalLayerDistance, session_to_draw, model);
        current_session_x += x_space_available_for_session_to_draw;
    }
    return result;
}

function compile() {
    //Parse yaml
    model = jsyaml.load(document.getElementById("yaml").value);
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
    code_input.value = "\\begin{tikzpicture}" + code_input.value + "\n\\end{tikzpicture}";

    update();
}

function update() {
  const s = document.createElement('script');
  s.setAttribute('type','text/tikz');
  s.textContent = `
\\newcommand{\\mathbb}[1]{\\mathbf{#1}} %workaround for mathbb
\\renewcommand{\\times}{~\\mathsf{x}~}
${code_input.value}
  `;
  output.innerHTML = '';
  output.appendChild(s);
  process_tikz(s);
}

let debounce_update = null;
let debounce_do = false;
  