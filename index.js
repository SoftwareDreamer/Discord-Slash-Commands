// The event listening which will handle ALL requests.
addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});


// Import all the command handlers
import { handleRate } from "./commands/rate"
import { handleStatsCommand } from "./commands/stats"

// Define all commands and their handlers
const commands = {
    rate: handleRate,
    stats: handleStatsCommand
};


// Application's public key to verify each requests signature
const PUBLIC_KEY = "f73ae9e497f66012e098b5b1a912ac6fd172d1f00bb2d24c1531edfca81973cb";


async function handleRequest(event) {
    const request = event.request;
    // Reject anything but POST requests
    if(request.method != "POST") {
        return new Response("{\"error\":\"400 - BAD REQUEST\",\"reason\":\"The " + request.method + " method is not allowed.\"}", {status: 400})
    }
    
    const body = await request.text();

    // Get the request signature and timestamp
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    // Respond with status 401 (as per Discord's docs) if there isn't a signature or timestamp
    if(!signature || !timestamp) {
        return new Response("{\"error\":\"401 - UNAUTHORIZED\",\"reason\":\"No signature or timestamp provided.\"}", {status: 401});
    }

    // Turn the public key key (at this point a string) into a CryptoKey object
    const key = await crypto.subtle.importKey(
        "raw",
        toBuffer(PUBLIC_KEY, true), 
        { name: "NODE-ED25519", namedCurve: "NODE-ED25519" }, 
        false, 
        ["verify"]
    );


    // Verify the signature/message to make sure it came from Discord itself
    const isVerified = await crypto.subtle.verify(
        "NODE-ED25519",
        key,
        toBuffer(signature, true),
        toBuffer(timestamp + body, false)
    );

    // Respond with status 401 (as per Discord's docs) if the signature doesn't match the recieved message
    if(!isVerified) {
        return new Response("{\"error\":\"401 - UNAUTHORIZED\",\"reason\":\"Invalid request signature.\"}", {status: 401});
    }
    // Verified that the message came from Discord
    // Now we can continue


    // Turn the request body into a JSON object; string ==> object
    const requestBody = JSON.parse(body);


    // Check what type of interaction it is: 1, 2 or 3
    // 1: Ping
    // 2: Command
    // 3: Message component
    switch(requestBody.type) {
        // PING
        case 1:
            // Return a response with type 1 to ACK the ping
            return new Response("{\"type\":1}", {headers: {"content-type": "application/json;charset=UTF-8"}});
            break;

        // APPLICATION_COMMAND
        case 2:
            // The code will continue while the command will be executed async.
            // So while 'handleCommand' is happening it'll already respond with '{type:5}'
            // to show the user a loading stage. 'handleCommand' will then edit the response
            // and replace it with the command generated response.
            event.waitUntil(handleCommand(request, requestBody));
            return new Response("{\"type\":5}", {headers: {"content-type": "application/json"}});

            break;

        // MESSAGE_COMPONENT
        case 3:
            // I don't expect a component interaction since I haven't added any components yet
            return new Response(JSON.stringify({
                        type: 4,
                        data: {
                            embeds: [
                                {
                                    title: "Not yet implemented",
                                    description: "This command hasn't been implemented yet.",
                                    color: parseInt("F12525", 16),
                                    fields: [
                                        {
                                            name: "Debug information",
                                            value: "```yml\nType: 3\n\nColo: " + request.cf.colo + "\nRequest Data: " + btoa(JSON.stringify(requestBody.data)) + "```"
                                        }
                                    ],
                                    timestamp: new Date()
                                }
                            ]
                        }
                    }), {headers: {"content-type": "application/json"}});
            break;

        // SOME_WEIRD_MESSAGE_WITHOUT_A_VALID_TYPE
        default:
            // Discord somehow send a message outside of their defined types
            return new Response(JSON.stringify({
                        type: 4,
                        data: {
                            embeds: [
                                {
                                    title: "Not yet implemented",
                                    description: "This command hasn't been implemented yet.",
                                    color: parseInt("F12525", 16),
                                    fields: [
                                        {
                                            name: "Debug information",
                                            value: "```yml\nType: Default\n\nColo: " + request.cf.colo + "\nRequest Data: " + btoa(JSON.stringify(requestBody.data)) + "```"
                                        }
                                    ],
                                    timestamp: new Date()
                                }
                            ]
                        }
                    }), {headers: {"content-type": "application/json"}});
            break;
    }
}


// Create a buffer from a (hex)string
// Used for request signature verification since the key, signature and request body need to be buffers
function toBuffer(string, hex) {
    if(hex) {
        const buffer = new ArrayBuffer(string.length / 2);
        const data = new DataView(buffer);

        for(let i = 0; i < string.length; i += 2) {
            data.setUint8(i / 2, parseInt(string.substr(i, 2), 16));
        }
        return data;
    } else {
        const encoder = new TextEncoder();
        return encoder.encode(string);
    }
}


// Get the command handler of the used command and generate the response from it
async function handleCommand(request, requestBody) {
    // Get the command handler associated with the command name
    const handler = commands[requestBody.data.name];

    let response;

    // If there is no handler then reply with not-yet-implemented message
    // else execute the handler
    if(!handler) {
        response = {
            embeds: [
                {
                    title: "Not yet implemented",
                    description: "This command hasn't been implemented yet.",
                    color: parseInt("F12525", 16),
                    timestamp: new Date(),
                    footer: {
                        text: "Request send by " + request.headers.get("x-real-ip")
                    }
                }
            ]
        };
    } else {
        response = await handler.call(this, request, requestBody);
    }
    // 'response' is now either the command response or a not-yet-implemented message


    const editURL = "https://discord.com/api/v8/webhooks/865321519605612554/" + requestBody.token + "/messages/" + ((requestBody.message && requestBody.message.id) || "@original");

    // Edit the thinking message with the generated one
    await fetch(editURL, {
        method: "PATCH",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(response),
    });
}